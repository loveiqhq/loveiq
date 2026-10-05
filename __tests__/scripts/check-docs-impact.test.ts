/**
 * The docs-impact gate must judge the PR's own changes, and leave the clone
 * it runs in as it found it.
 *
 * It fetched main with `--depth=1`. That marks main's tip as having no
 * parents, so once main had moved past a branch's base the three-dot diff
 * failed and the script silently compared whole trees: a doc someone else
 * merged counted as this PR's (a false failure on PR #253). Run locally, the
 * same fetch made the shared clone shallow and broke `git rebase` in every
 * worktree beside it.
 *
 * Built in a throwaway repo with every GIT_* variable removed: a git hook
 * exports GIT_DIR, and a sandbox that inherits it operates on the real repo.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts/check-docs-impact.sh");
const dir = mkdtempSync(join(tmpdir(), "docs-gate-"));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))
) as NodeJS.ProcessEnv;
const sh = (cmd: string, cwd = dir) =>
  execFileSync("bash", ["-c", cmd], { cwd, env, encoding: "utf8", stdio: "pipe" });

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("check-docs-impact.sh when main has moved", () => {
  it("counts only the PR's changes and leaves the clone full", () => {
    sh(`git init -q --bare -b main remote.git && git clone -q "file://${dir}/remote.git" work`);
    const work = join(dir, "work");
    sh(
      `git config user.email t@t && git config user.name t && mkdir -p scripts docs &&
       cp "${SCRIPT}" scripts/ && echo a > a.ts && git add -A && git commit -qm base &&
       git push -q origin HEAD:main &&
       git checkout -qb feature && echo x > x.ts && git add x.ts && git commit -qm pr &&
       git checkout -q main && echo doc > docs/other.md && git add docs && git commit -qm other &&
       git push -q origin main && git checkout -q feature`,
      work
    );
    let out: string;
    try {
      out = sh(
        `PR_BODY="- [x] No doc impact" bash scripts/check-docs-impact.sh origin/main 2>&1`,
        work
      );
    } catch (err) {
      out = String((err as { stdout?: string }).stdout ?? err);
    }
    expect(out).toContain("All checks passed");
    expect(out).not.toContain("docs/other.md");
    expect(existsSync(join(work, ".git", "shallow"))).toBe(false);
  });
});
