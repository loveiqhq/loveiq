/**
 * Exercise the one part of the UX verifier that writes to GitHub.
 *
 * `openReproductionPr` has been enabled in `ux-review-verify.yml` since it was
 * written (`UX_REVIEW_OPEN_PR: "1"`) and has never once executed, because no
 * finding has reproduced yet — 9 findings over the runs checked, 0 reproduced.
 * So the first time it runs for real would also be the first time anyone learns
 * whether it works, and it runs with `contents: write` on a public repo.
 *
 * This drives the REAL git binary against a throwaway bare remote, with `gh`
 * stubbed on PATH so nothing reaches GitHub. Everything else is the real thing.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, beforeAll } from "vitest";

// @ts-expect-error -- .mjs helper, no types
import { openReproductionPr } from "../../scripts/lib/replay-pr.mjs";

let root: string;
let work: string;
let origin: string;
let ghLog: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** Run it against the sandbox repo, with `gh` stubbed onto PATH. */
let lastLog = "";

function call(args: Record<string, unknown>, env: Record<string, string> = {}) {
  const prevPath = process.env.PATH;
  const prevFlag = process.env.UX_REVIEW_OPEN_PR;
  process.env.PATH = `${join(root, "stub")}:${prevPath}`;
  process.env.UX_REVIEW_OPEN_PR = "1";
  Object.assign(process.env, env);
  const said: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => void said.push(a.join(" "));
  try {
    const out = openReproductionPr({ ...args, cwd: work }) ?? null;
    lastLog = said.join("\n");
    return out;
  } finally {
    console.log = log;
    process.env.PATH = prevPath;
    if (prevFlag === undefined) delete process.env.UX_REVIEW_OPEN_PR;
    else process.env.UX_REVIEW_OPEN_PR = prevFlag;
  }
}

const finding = (over: Record<string, unknown> = {}) => ({
  criterion: { id: "C1", label: "Report never painted" },
  sessionId: "01a0a390-7459-7970-b09c-d6a31daa380a",
  viewport: { min: 390, max: 844 },
  results: [
    {
      file: "verify-report-paints.mjs",
      tail: "FAIL: no chapter rendered in 20s",
      passed: false,
      inconclusive: false,
    },
  ],
  ...over,
});

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "replay-pr-"));
  origin = join(root, "origin.git");
  work = join(root, "work");
  ghLog = join(root, "gh-args.txt");

  execFileSync("git", ["init", "--bare", "-b", "main", origin]);
  execFileSync("git", ["init", "-b", "main", work]);
  git(work, "config", "user.email", "t@example.com");
  git(work, "config", "user.name", "t");
  writeFileSync(join(work, "README.md"), "sandbox\n");
  git(work, "add", "README.md");
  git(work, "commit", "-m", "init");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-u", "origin", "main");

  // `gh` stub: record argv, print a PR URL. Nothing leaves the machine.
  mkdirSync(join(root, "stub"));
  const stub = join(root, "stub", "gh");
  writeFileSync(
    stub,
    `#!/bin/sh\nprintf '%s\\n' "$@" >> ${JSON.stringify(ghLog)}\necho "https://github.com/loveiqhq/loveiq/pull/999"\n`
  );
  chmodSync(stub, 0o755);
});

describe("openReproductionPr", () => {
  it("pushes a branch, commits the reproduction, and opens a DRAFT pr", () => {
    const url = call(finding());
    expect(url).toBe("https://github.com/loveiqhq/loveiq/pull/999");

    // The branch really reached the remote.
    const heads = execFileSync("git", ["ls-remote", "--heads", origin], { encoding: "utf8" });
    expect(heads).toContain("refs/heads/replay/c1-01a0a390");

    // ...carrying the evidence, not a fix.
    const files = execFileSync("git", ["show", "--name-only", "--format=", "replay/c1-01a0a390"], {
      cwd: origin,
      encoding: "utf8",
    }).trim();
    expect(files).toBe("scripts/replay-bench/reproductions/c1-01a0a390.json");

    const blob = execFileSync("git", ["show", `replay/c1-01a0a390:${files}`], {
      cwd: origin,
      encoding: "utf8",
    });
    const record = JSON.parse(blob);
    expect(record.criterion).toBe("C1");
    expect(record.reproduced).toBe(true);
    expect(record.recording).toContain("01a0a390-7459-7970-b09c-d6a31daa380a");
    expect(record.probes[0].output).toContain("no chapter rendered");

    // Every commit in this repo carries a plain-English line for Marcus.
    const msg = execFileSync("git", ["log", "-1", "--format=%B", "replay/c1-01a0a390"], {
      cwd: origin,
      encoding: "utf8",
    });
    expect(msg).toContain("For Marcus:");

    const gh = readFileSync(ghLog, "utf8");
    expect(gh).toContain("--draft");
    expect(gh).toContain("pr\ncreate");
    expect(gh).toMatch(/--base\nmain/);
  });

  it("leaves the working tree back on the branch it started from", () => {
    expect(git(work, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
  });

  it("recognises a reproduction already pushed, instead of colliding with it", () => {
    expect(call(finding())).toBeNull();
    // Without the ls-remote check this still returns null — git refuses the
    // duplicate branch — but it gets there by failing. Only the log tells the
    // two apart, so that is what is asserted.
    expect(lastLog).not.toContain("could not open a PR");
  });

  it("refuses when the flag is not set, whatever the finding", () => {
    expect(
      call(finding({ sessionId: "01a0b111-1111-2222-3333-444444444444" }), {
        UX_REVIEW_OPEN_PR: "",
      })
    ).toBeNull();
  });

  it("refuses a criterion that has no probe strong enough to auto-file", () => {
    // E1's error class and S1's scroll heuristics go to a human in the thread.
    expect(
      call(
        finding({
          criterion: { id: "E1", label: "Checkout error" },
          sessionId: "01a0c555-5555-2222-3333-444444444444",
        })
      )
    ).toBeNull();
  });

  it("refuses an id that looks fine as a branch but is not safe in the pr body", () => {
    // The first 8 characters are all the BRANCH name uses, so an id can pass as
    // a ref and still carry an injection into the recording URL and PR body.
    // "../../evil" proves nothing here: git rejects that ref on its own.
    expect(
      call(finding({ sessionId: "01a0d777-7459) [click](https://evil.example) x" }))
    ).toBeNull();
  });
});
