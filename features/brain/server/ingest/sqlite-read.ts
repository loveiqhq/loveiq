import { execFileSync } from "node:child_process";

/**
 * Rows from a SQLite database another app is writing, read-only, as JSON.
 *
 * Through SQLite's own locking (`mode=ro`), NOT `immutable=1`. WhatsApp keeps its newest
 * writes in the `-wal` file until it checkpoints, and `immutable=1` reads the main file
 * alone: measured through the launcher on 2026-09-28, a message 20 seconds old was missing
 * from it while a read that included the WAL had it (2,522 against 2,523). It also promises
 * SQLite the file cannot change, and during a checkpoint it does, which SQLite documents as
 * wrong results or SQLITE_CORRUPT. A reader in WAL mode never blocks the app's writes; the
 * busy timeout covers the moment the app holds the lock to reset the WAL.
 *
 * ONE FALLBACK. A read-only open cannot create the `-wal` and `-shm` files, so when they are
 * gone (the app closed and removed them) it fails with "unable to open database file". The
 * main file then holds every committed write, which is exactly when reading it alone is
 * right. Nothing else falls back: a lock or a real failure still throws.
 */
export function readRows<T>(db: string, sql: string): T[] {
  const run = (uri: string) =>
    execFileSync("sqlite3", ["-readonly", "-json", "-cmd", ".timeout 5000", uri, sql], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // A read that hangs (it did, for 7.5 hours on 2026-09-26) blocks every later run,
      // since launchd never starts a second copy. Killed after two minutes, it fails instead.
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  let out: string;
  try {
    out = run(`file:${db}?mode=ro`);
  } catch (err) {
    const stderr = String((err as { stderr?: unknown }).stderr ?? "");
    if (!/unable to open database file/i.test(stderr)) throw err;
    out = run(`file:${db}?immutable=1`);
  }
  return out.trim() ? (JSON.parse(out) as T[]) : [];
}
