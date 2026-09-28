/**
 * readRows against throwaway WAL databases, never WhatsApp's: opening another app's
 * container from a test process makes macOS ask for access, and the run hangs.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readRows } from "@features/brain/server/ingest/sqlite-read";

const hasSqlite = spawnSync("sqlite3", ["-version"]).status === 0;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function walDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-read-"));
  dirs.push(dir);
  const db = join(dir, "t.db");
  execFileSync("sqlite3", [
    db,
    "pragma journal_mode=wal; create table m(a); insert into m values (1), (2);",
  ]);
  return db;
}
const count = (db: string) => readRows<{ n: number }>(db, "select count(*) as n from m;")[0]?.n;

describe.skipIf(!hasSqlite)("readRows", () => {
  it("reads rows a writer still holds in the WAL, which immutable=1 cannot see", async () => {
    const db = walDb();
    // A writer that keeps its connection open, with checkpoints off, so the new row
    // exists only in the -wal file while we read.
    const writer = spawn("sqlite3", [db], { stdio: ["pipe", "ignore", "ignore"] });
    writer.stdin.write("pragma wal_autocheckpoint=0;\ninsert into m values (3);\n.shell sleep 5\n");
    try {
      await new Promise((r) => setTimeout(r, 800));
      const immutable = JSON.parse(
        execFileSync(
          "sqlite3",
          ["-json", `file:${db}?immutable=1`, "select count(*) as n from m;"],
          {
            encoding: "utf8",
          }
        )
      ) as Array<{ n: number }>;
      expect(immutable[0]?.n).toBe(2);
      expect(count(db)).toBe(3);
    } finally {
      writer.kill();
    }
  });

  it("reads the main file alone when the -wal and -shm files are gone", () => {
    const db = walDb();
    rmSync(`${db}-wal`, { force: true });
    rmSync(`${db}-shm`, { force: true });
    expect(existsSync(`${db}-wal`)).toBe(false);
    expect(count(db)).toBe(2);
  });

  it(
    "throws on a lock rather than falling back to the main file",
    { timeout: 20_000 },
    async () => {
      // Only a missing -wal/-shm may fall back; reading the main file under a live writer is
      // the torn read the WAL read exists to avoid.
      const db = walDb();
      const writer = spawn("sqlite3", [db], { stdio: ["pipe", "ignore", "ignore"] });
      writer.stdin.write(
        "pragma locking_mode=exclusive;\nbegin exclusive;\ninsert into m values (9);\n.shell sleep 12\n"
      );
      try {
        await new Promise((r) => setTimeout(r, 800));
        expect(() => count(db)).toThrow(/locked|busy/i);
      } finally {
        writer.kill();
      }
    }
  );

  it("still throws for a database that is not there", () => {
    expect(() => count(join(tmpdir(), "no-such-dir-sqlite-read", "t.db"))).toThrow();
  });
});
