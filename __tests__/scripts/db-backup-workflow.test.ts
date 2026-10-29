import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * The weekly database backup (.github/workflows/db-backup.yml) is the copy we restore from
 * if Supabase is lost. These pin the promises it makes: a copy leaves the runner only
 * encrypted, it is kept no longer than the privacy policy keeps a deleted account, and it is
 * named after its run, which is how a vanished copy is noticed. This repository is public,
 * so a private age key pasted into the workflow would open every copy.
 */
describe("the database backup", () => {
  const yml = read(".github/workflows/db-backup.yml");

  it("names an age public key, never a private one", () => {
    expect(yml).toMatch(/\n {2}AGE_RECIPIENT: age1[02-9ac-hj-np-z]{58}\n/);
    expect(yml).not.toMatch(/AGE-SECRET-KEY-/i);
  });

  it("encrypts the dump and deletes the plain copy before anything is uploaded", () => {
    const encrypt = yml.indexOf('age -r "$AGE_RECIPIENT" -o "$RUNNER_TEMP/db.pgdump.age"');
    const remove = yml.indexOf('rm "$RUNNER_TEMP/db.pgdump"');
    const upload = yml.indexOf('db-backup-blob.mjs" upload "$RUNNER_TEMP/db.pgdump.age"');
    expect(encrypt).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(encrypt);
    expect(upload).toBeGreaterThan(remove);
    expect(yml.match(/db-backup-blob\.mjs" upload/g)).toHaveLength(1);
  });

  it("keeps copies no longer than the privacy policy keeps a deleted account's data", () => {
    expect(read("app/privacy-policy/page.tsx")).toContain(
      "Up to 30 days after deletion of your account"
    );
    const days = Number(/db-backup-blob\.mjs" prune (\d+)/.exec(yml)?.[1]);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(30);
    // The missing-copy check must not count a copy the prune is entitled to delete.
    const checked = Number(/date -u -d '(\d+) days ago'/.exec(yml)?.[1]);
    expect(checked).toBeLessThan(days);
  });

  it("names every copy after its run, which is what the missing-copy check looks for", () => {
    expect(yml).toContain("_run-${GITHUB_RUN_ID}.pgdump.age");
    expect(read("scripts/db-backup-blob.mjs")).toContain("`_run-${id}.`");
  });
});
