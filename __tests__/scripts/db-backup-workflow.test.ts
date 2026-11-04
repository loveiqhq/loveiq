import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "yaml";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * The weekly database backup (.github/workflows/db-backup.yml) is the copy we restore from
 * if Supabase is lost. These pin the promises it makes: a copy leaves the runner only
 * encrypted, the job holding the plain data runs no install scripts, a copy is kept no longer
 * than the privacy policy keeps a deleted account, and it is named after its run, which is
 * how a vanished copy is noticed. This repository is public, so a private age key pasted into
 * the workflow would open every copy.
 */
describe("the database backup", () => {
  const yml = read(".github/workflows/db-backup.yml");
  type Step = { run?: string; uses?: string };
  const jobs = (parse(yml) as { jobs: Record<string, { steps: Step[] }> }).jobs;

  it("names an age public key, never a private one", () => {
    expect(yml).toMatch(/\n {2}AGE_RECIPIENT: age1[02-9ac-hj-np-z]{58}\n/);
    expect(yml).not.toMatch(/AGE-SECRET-KEY-/i);
  });

  it("encrypts the dump and deletes the plain copy before anything is uploaded", () => {
    const encrypt = yml.indexOf('age -r "$AGE_RECIPIENT" -o "$RUNNER_TEMP/db.pgdump.age"');
    const remove = yml.indexOf('rm "$RUNNER_TEMP/db.pgdump"');
    const upload = yml.indexOf('blob.mjs upload "$RUNNER_TEMP/db.pgdump.age"');
    expect(encrypt).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(encrypt);
    expect(upload).toBeGreaterThan(remove);
    // The only other upload is the pg_cron statements, which hold no data.
    const uploaded = [...yml.matchAll(/blob\.mjs upload "([^"]+)"/g)].map((m) => m[1]);
    expect(uploaded).toEqual(["$RUNNER_TEMP/db.pgdump.age", "$RUNNER_TEMP/cron.sql"]);
  });

  it("installs nothing beside the plain data but the pinned Blob client, without install scripts", () => {
    const installs = jobs.backup.steps
      .flatMap((s) => (s.run ?? "").split("\n"))
      .filter((line) => /\b(npm|npx|pnpm|yarn)\b/.test(line));
    expect(installs).toEqual([
      "npm ci --prefix scripts/db-backup --ignore-scripts --no-audit --no-fund",
    ]);
    expect(read("scripts/db-backup/package-lock.json")).toContain('"@vercel/blob"');
    // The app's install, with every package's install script, is in a job of its own.
    expect(jobs.record.steps.some((s) => s.run === "npm ci")).toBe(true);
  });

  it("keeps copies no longer than the privacy policy keeps a deleted account's data", () => {
    expect(read("app/privacy-policy/page.tsx")).toContain(
      "Up to 30 days after deletion of your account"
    );
    const days = Number(/blob\.mjs prune (\d+)/.exec(yml)?.[1]);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(30);
    // The missing-copy check must not count a copy the prune is entitled to delete.
    const checked = Number(/date -u -d '(\d+) days ago'/.exec(yml)?.[1]);
    expect(checked).toBeLessThan(days);
  });

  it("names every copy after its run, which is what the missing-copy check looks for", () => {
    expect(yml).toContain("_run-${GITHUB_RUN_ID}.pgdump.age");
    expect(read("scripts/db-backup/blob.mjs")).toContain("`_run-${id}.pgdump.age`");
  });
});
