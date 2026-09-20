/**
 * The gate that decides whether a fix is proven.
 *
 * This is the piece Phase 5 rests on: a fix may come from a model, a codemod or
 * a person, and what makes it safe to merge is that something outside the author
 * checked it. Every step of that check is a command with an exit code — but the
 * DIFF judgement is pure, and it is where the dangerous mistakes live, so it is
 * pinned here rather than only in the script's own selftest.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { countDiff, judgeDiff } from "../../scripts/prove-fix.mjs";

const SRC = readFileSync(resolve(process.cwd(), "scripts/prove-fix.mjs"), "utf8");

describe("what a generated fix is allowed to touch", () => {
  it("accepts a presentation-only change", () => {
    expect(judgeDiff(["features/survey/ui/SurveyPage.tsx"], 12).ok).toBe(true);
  });

  it("accepts tests alongside it", () => {
    // A fix that brings its own regression test is strictly better, and test
    // files change no runtime behaviour, so the probe's verdict still covers
    // everything that ships.
    expect(judgeDiff(["features/survey/tests/SurveyPage.test.tsx"], 40).ok).toBe(true);
  });

  /**
   * THE SECOND WAY TO EDIT THE JUDGE, and the pipeline found it unprompted.
   *
   * Test lines are free against the cap, on the assumption that they only ever
   * get ADDED. PR #222 — the first fix this pipeline generated on its own — was
   * told "do not change whether the button is disabled". It removed `disabled`
   * from the button and deleted `expect(agreeButton).toBeDisabled()` from the
   * existing test. Probe green, suite green, six checks green: the assertion
   * that would have failed was the one it deleted.
   *
   * A deletion inside a test is the same act as editing a probe, so it gets the
   * same answer. A NEW test file has no deletions and stays free.
   */
  it("refuses a fix that deletes lines from an existing test", () => {
    const r = judgeDiff(
      ["features/survey/ui/SurveyPage.tsx", "features/survey/tests/SurveyPage.test.tsx"],
      {
        total: 24,
        product: 18,
        testCuts: [{ file: "features/survey/tests/SurveyPage.test.tsx", deletions: 4 }],
      }
    );
    expect(r.ok).toBe(false);
    // Oversize is a tier, not a refusal — this must be a refusal.
    expect(r.oversize).toBe(false);
    expect(r.why).toMatch(/never delete them/);
    expect(r.why).toContain("SurveyPage.test.tsx");
  });

  it("spots a test deletion in the numstat itself", () => {
    // The judgement above is only as good as the collection. These are the real
    // numstat lines PR #222 produced.
    const c = countDiff([
      "5\t4\tfeatures/survey/tests/SurveyPage.test.tsx",
      "15\t3\tfeatures/survey/ui/SurveyPage.tsx",
    ]);
    expect(c.testCuts).toEqual([
      { file: "features/survey/tests/SurveyPage.test.tsx", deletions: 4 },
    ]);
    expect(c.product).toBe(18); // the test file does not count against the cap
    expect(c.total).toBe(27);
    expect(judgeDiff(["features/survey/ui/SurveyPage.tsx"], c).ok).toBe(false);
  });

  it("does not mistake a brand-new test file for a deletion", () => {
    const c = countDiff(["56\t0\tfeatures/survey/tests/New.test.tsx"]);
    expect(c.testCuts).toEqual([]);
    expect(c.product).toBe(0);
  });

  it("still lets a fix add a brand-new test for free", () => {
    // Without this the guard could refuse every test change and look correct.
    expect(
      judgeDiff(["features/survey/ui/SurveyPage.tsx", "features/survey/tests/New.test.tsx"], {
        total: 93,
        product: 37,
        testCuts: [],
      }).ok
    ).toBe(true);
  });

  /**
   * THE HOLE THAT MATTERED. The first allowlist permitted scripts/probes/, so a
   * "fix" could edit the probe until it stopped failing and every later step
   * would certify it — reproduces on base with the old probe, passes on the fix
   * with the new one. The before and after would be answering two different
   * questions and the green light would mean nothing.
   */
  it("refuses a fix that edits its own judge", () => {
    expect(judgeDiff(["scripts/probes/verify-survey-loop.mjs"], 2).ok).toBe(false);
    expect(judgeDiff(["scripts/prove-fix.mjs"], 2).ok).toBe(false);
  });

  /**
   * The assertion above passes for the WRONG REASON on its own, and a mutation
   * proved it: deleting `scripts/` from DENY changed nothing, because those
   * paths are also outside ALLOW and were refused by the fallthrough. The guard
   * that actually matters would then be gone with every test still green, and
   * anyone later widening ALLOW to cover scripts/ would unlock it silently.
   *
   * So this pins DENY itself, by handing in an allowlist that DOES permit
   * scripts/ and requiring the refusal to survive.
   */
  it("refuses it because DENY says so, not merely because ALLOW is narrow", () => {
    const permissive = [/^scripts\//, /^features\//];
    expect(
      judgeDiff(["scripts/probes/verify-survey-loop.mjs"], 2, { allow: permissive }).ok,
      "with scripts/ explicitly allowed, only DENY can still refuse it"
    ).toBe(false);
    // The control: the same permissive allowlist must still let a real fix through,
    // or this test would pass even if judgeDiff refused everything.
    expect(judgeDiff(["features/survey/ui/SurveyPage.tsx"], 2, { allow: permissive }).ok).toBe(
      true
    );
  });

  it("refuses a probe edit smuggled in beside a real fix", () => {
    const r = judgeDiff(["features/survey/ui/SurveyPage.tsx", "scripts/probes/x.mjs"], 6);
    expect(r.ok).toBe(false);
  });

  it("refuses anything a probe cannot vouch for", () => {
    for (const path of [
      "app/api/survey/route.ts",
      "supabase/migrations/20260101_x.sql",
      "shared/auth/supabase-middleware.ts",
      "proxy.ts",
      ".github/workflows/ci.yml",
      "package.json",
      "features/checkout/ui/CheckoutPage.tsx",
    ]) {
      expect(judgeDiff([path], 2).ok, `${path} should be refused`).toBe(false);
    }
  });

  it("lets DENY beat ALLOW", () => {
    // features/checkout/ui/ matches the allow pattern AND the payment deny
    // pattern. If allow won, widening the allowlist would silently unlock a
    // denied path.
    expect(judgeDiff(["features/checkout/ui/Pay.tsx"], 2).ok).toBe(false);
  });

  /**
   * SIZE IS A TIER, NOT A GATE — and this test used to assert the opposite.
   *
   * Paths and lines answer different questions. A denied PATH means a probe
   * cannot speak to the change at all, so it is refused before anything runs.
   * A large diff is not like that: the probe's answer is still true, there is
   * simply more change than one probe's word is worth. Refusing it unmeasured
   * threw away the measurement as well — the real survey-loop fix was 171
   * product lines and we learned nothing about whether it worked.
   */
  it("proves a large change, but marks it for real review", () => {
    const big = judgeDiff(["features/survey/ui/SurveyPage.tsx"], 10_000);
    expect(big.ok, "an oversize change is still measured").toBe(true);
    expect(big.oversize, "…and flagged so it opens as a draft").toBe(true);
  });

  it("does not mark a small change", () => {
    expect(judgeDiff(["features/survey/ui/SurveyPage.tsx"], 10).oversize).toBe(false);
  });

  it("still refuses a denied path outright, however small", () => {
    // The gate that did not become a tier: one line touching a payment route
    // is still something no UI probe can vouch for.
    expect(judgeDiff(["features/checkout/ui/Pay.tsx"], 1).ok).toBe(false);
    expect(judgeDiff(["app/api/survey/route.ts"], 1).ok).toBe(false);
  });

  it("refuses an empty diff — nothing is not a fix", () => {
    expect(judgeDiff([], 0).ok).toBe(false);
  });
});

describe("the proof reports its tier", () => {
  /**
   * The workflow greps for this line to decide draft vs ready. It went missing
   * once — a prettier reflow moved the anchor my edit targeted and the write
   * silently did nothing — and the cost was a genuinely PROVEN fix never
   * becoming a pull request: six green checks, "PROVEN" printed, then grep
   * found nothing and exited 1 under `bash -e`.
   */
  it("emits a machine-readable tier alongside the prose", () => {
    expect(SRC).toContain("PROVEN_TIER=");
    expect(SRC).toMatch(/PROVEN_TIER=\$\{verdict\.oversize \? "large" : "small"\}/);
  });

  it("is greped in a way that cannot undo a successful proof", () => {
    const WF = readFileSync(resolve(process.cwd(), ".github/workflows/generate-fix.yml"), "utf8");
    const line = WF.split("\n").find((l) => l.includes("PROVEN_TIER=(small|large)"));
    expect(line, "the workflow no longer reads the tier").toBeTruthy();
    expect(line, "a grep miss must not fail the step").toContain("|| true");
  });
});

describe("the proof obligation itself", () => {
  it("passes its own selftest", () => {
    const out = execFileSync("node", ["scripts/prove-fix.mjs", "--selftest"], { encoding: "utf8" });
    expect(out).toContain("selftest ok");
  });

  it("requires the base to reproduce before anything counts", () => {
    // Without this a "fix" for a defect that was never there would be certified.
    expect(SRC).toContain("nothing to fix on the base commit");
  });

  it("re-runs the base to catch a flaky reproduction", () => {
    // A one-off failure that does not repeat would otherwise certify any diff.
    expect(SRC).toContain("flake guard");
    expect(SRC).toContain("the reproduction did not repeat");
  });

  it("probes a build of the commit, never production", () => {
    // Pointing at the live site proves something about whatever is deployed,
    // which is neither commit under test.
    expect(SRC).toContain("not against production");
    // REPORT_ORIGIN must be applied AFTER the caller's env, or PROBE_ENV could
    // redirect the probe at production while the harness reports otherwise.
    expect(SRC).toMatch(/\.\.\.PROBE_ENV, REPORT_ORIGIN: origin/);
  });

  /**
   * A caller should not have to know whether a ref exists locally. In CI it
   * never does — actions/checkout fetches the ref it checked out and nothing
   * else — so a branch that exists perfectly well on the remote failed
   * `git rev-parse` with 'unknown revision'. The first run of prove-fix.yml
   * died on exactly that, before measuring anything at all.
   */
  it("resolves a ref that only exists on the remote", () => {
    expect(SRC).toContain("`origin/${ref}`");
    // `^{commit}` so a tag or an annotated object resolves to a commit rather
    // than to itself, which would break the later worktree add.
    expect(SRC).toContain("^{commit}");
  });

  it("fails loudly when a ref cannot be found at all", () => {
    // Silently falling back to HEAD would prove a diff nobody asked about.
    expect(SRC).toMatch(/cannot resolve .* locally or on origin/);
  });

  it("never touches the working checkout", () => {
    expect(SRC).toContain("worktree");
    expect(SRC).not.toMatch(/execFileSync\("git", \["checkout"/);
  });
});
