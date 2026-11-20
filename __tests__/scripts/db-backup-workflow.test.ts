import { describe, expect, it } from "vitest";

import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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

  it("leaves foreign keys into auth out of the test restore, and keeps every other one", () => {
    // mira_user.id refers to auth.users, which the dump does not carry: without this the test
    // restore fails and no copy is stored. Run the step's own lines against a stand-in pg_restore.
    const run = Object.values(jobs)
      .flatMap((j) => j.steps)
      .map((st) => st.run ?? "")
      .find((r) => r.includes("restore.list"))!;
    const lines = run.split("\n");
    const from = lines.findIndex((l) => l.includes("auth_fks=$("));
    const to = lines.findIndex((l) => l.includes('> "$RUNNER_TEMP/restore.list"'));
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const snippet = lines.slice(from, to + 1).join("\n");

    const listFor = (postData: string) => {
      const dir = mkdtempSync(join(tmpdir(), "restore-list-"));
      try {
        writeFileSync(join(dir, "post-data.sql"), postData);
        writeFileSync(
          join(dir, "toc.txt"),
          [
            "1; 2615 2200 SCHEMA - public pg_database_owner",
            "10; 1259 100 TABLE public mira_user postgres",
            "11; 2606 101 FK CONSTRAINT public mira_user mira_user_id_fkey postgres",
            "12; 2606 102 FK CONSTRAINT public mira_chat mira_chat_user_id_fkey postgres",
          ].join("\n") + "\n"
        );
        writeFileSync(
          join(dir, "pg_restore"),
          `#!/bin/bash\nif [ "$1" = "--section=post-data" ]; then cat "${dir}/post-data.sql"; else cat "${dir}/toc.txt"; fi\n`
        );
        chmodSync(join(dir, "pg_restore"), 0o755);
        execFileSync("bash", ["-c", `set -euo pipefail\n${snippet}`], {
          env: { ...process.env, RUNNER_TEMP: dir, PATH: `${dir}:${process.env.PATH}` },
        });
        return readFileSync(join(dir, "restore.list"), "utf8");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };

    const withAuthKey = listFor(
      [
        "ALTER TABLE ONLY public.mira_user",
        "    ADD CONSTRAINT mira_user_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;",
        "ALTER TABLE ONLY public.mira_chat",
        "    ADD CONSTRAINT mira_chat_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.mira_user(id);",
      ].join("\n")
    );
    expect(withAuthKey).not.toContain("mira_user_id_fkey");
    expect(withAuthKey).toContain("FK CONSTRAINT public mira_chat mira_chat_user_id_fkey");
    expect(withAuthKey).toContain("TABLE public mira_user");
    expect(withAuthKey).not.toContain("SCHEMA - public");

    // A dump without any key into auth restores every key.
    const without = listFor(
      "ALTER TABLE ONLY public.x\n    ADD CONSTRAINT x_pkey PRIMARY KEY (id);\n"
    );
    expect(without).toContain("mira_user_id_fkey");
    expect(without).toContain("mira_chat_user_id_fkey");
  });

  it("names every copy after its run, which is what the missing-copy check looks for", () => {
    expect(yml).toContain("_run-${GITHUB_RUN_ID}.pgdump.age");
    expect(read("scripts/db-backup/blob.mjs")).toContain("`_run-${id}.pgdump.age`");
  });
});
