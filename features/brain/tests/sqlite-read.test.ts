/**
 * readRows against throwaway WAL databases, never WhatsApp's: opening another app's
 * container from a test process makes macOS ask for access, and the run hangs.
 */
import { type ChildProcess, execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readRows } from "@features/brain/server/ingest/sqlite-read";

const hasSqlite = spawnSync("sqlite3", ["-version"]).status === 0;
const dirs: string[] = [];
const writers: ChildProcess[] = [];
afterEach(() => {
  for (const w of writers.splice(0)) w.kill();
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

/**
 * A writer that runs `sql`, then keeps its connection open. Ready is a file it touches
 * AFTER the SQL ran: its stdout is a pipe, which sqlite3 buffers until it exits.
 */
async function holdOpen(db: string, sql: string): Promise<void> {
  const ready = `${db}.ready`;
  const writer = spawn("sqlite3", [db], { stdio: ["pipe", "ignore", "ignore"] });
  writers.push(writer);
  writer.stdin.write(`${sql}\n.shell touch '${ready}'; sleep 20\n`);
  for (let waited = 0; !existsSync(ready); waited += 25) {
    if (waited > 10_000) throw new Error("the writer never got ready");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe.skipIf(!hasSqlite)("readRows", () => {
  it("reads rows a writer still holds in the WAL, which immutable=1 cannot see", async () => {
    const db = walDb();
    await holdOpen(db, "pragma wal_autocheckpoint=0;\ninsert into m values (3);");
    const immutable = JSON.parse(
      execFileSync("sqlite3", ["-json", `file:${db}?immutable=1`, "select count(*) as n from m;"], {
        encoding: "utf8",
      })
    ) as Array<{ n: number }>;
    expect(immutable[0]?.n).toBe(2);
    expect(count(db)).toBe(3);
  });

  it("reads the main file alone when the -wal and -shm files are gone", () => {
    const db = walDb();
    rmSync(`${db}-wal`, { force: true });
    rmSync(`${db}-shm`, { force: true });
    expect(count(db)).toBe(2);
  });

  it("throws, not reads the main file, when -wal holds rows and -shm cannot be made", async () => {
    // With -shm missing in a directory it cannot write, a read-only open fails as it does
    // when both files are gone. Read alone, the main file here lacks row 3, which only
    // the WAL holds, so falling back would drop it.
    const db = walDb();
    await holdOpen(db, "pragma wal_autocheckpoint=0;\ninsert into m values (3);");
    const dir = mkdtempSync(join(tmpdir(), "sqlite-read-copy-"));
    dirs.push(dir);
    const copy = join(dir, "t.db");
    copyFileSync(db, copy);
    copyFileSync(`${db}-wal`, `${copy}-wal`);
    chmodSync(dir, 0o555);
    try {
      expect(() => count(copy)).toThrow(/unable to open database file/);
    } finally {
      chmodSync(dir, 0o755);
    }
  });

  it(
    "throws on a lock rather than falling back to the main file",
    { timeout: 20_000 },
    async () => {
      // Only a missing -wal/-shm may fall back; reading the main file under a live writer is
      // the torn read the WAL read exists to avoid.
      const db = walDb();
      await holdOpen(
        db,
        "pragma locking_mode=exclusive;\nbegin exclusive;\ninsert into m values (9);"
      );
      expect(() => count(db)).toThrow(/locked|busy/i);
    }
  );

  it("does not fall back when it cannot tell whether a -wal exists", () => {
    // A -wal that is a symlink loop: access() says ELOOP, not "no such file", and the
    // read-only open fails the same way a missing pair does. Not knowing never falls back.
    const db = walDb();
    rmSync(`${db}-wal`, { force: true });
    rmSync(`${db}-shm`, { force: true });
    symlinkSync(`${db}-wal`, `${db}-wal`);
    expect(() => count(db)).toThrow(/unable to open database file/);
  });

  it("still throws for a database that is not there", () => {
    expect(() => count(join(tmpdir(), "no-such-dir-sqlite-read", "t.db"))).toThrow();
  });
});
