/**
 * The corpus that measures probe precision must not quietly empty out.
 *
 * Everything else in this repo measures the SCANNERS. The probes are what the
 * pipeline trusts: a scanner being wrong costs CI minutes because a probe gates
 * it, but a probe being wrong posts a verdict into a reader's thread and, for
 * AUTO_PR_CRITERIA, opens a draft pull request.
 *
 * On 2026-09-19 verify-dead-click-target reported the survey consent gate as a
 * dead control. The button is deliberately disabled until both consent boxes
 * are ticked — correct behaviour, reproduced convincingly, the daily probe job
 * and the weekly falsifiability job both green. It was caught by hand.
 *
 * A deleted case is a guard that silently stops guarding, which is why the
 * count is asserted to go UP and the regression case is pinned by name.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const corpus = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/probes/_known-good.json"), "utf8")
) as { cases: Array<{ probe: string; why: string; env?: Record<string, string> }> };

const SRC = readFileSync(resolve(process.cwd(), "scripts/probes/precision-check.mjs"), "utf8");
const WORKFLOW = readFileSync(resolve(process.cwd(), ".github/workflows/probe-guard.yml"), "utf8");

describe("the known-good corpus", () => {
  it("has not shrunk", () => {
    // Six on 2026-09-19. Raise this when cases are added; never lower it.
    expect(corpus.cases.length).toBeGreaterThanOrEqual(6);
  });

  it("still pins the consent gate, the case that was actually wrong", () => {
    const consent = corpus.cases.find(
      (c) =>
        c.probe === "verify-dead-click-target.mjs" && c.env?.TARGET_SELECTOR === "button.flex-1"
    );
    expect(consent, "the regression this corpus exists for is no longer covered").toBeTruthy();
  });

  it("gives every case a reason, so a later reader can judge it", () => {
    for (const c of corpus.cases) {
      expect(c.probe, "a case with no probe measures nothing").toBeTruthy();
      expect((c.why ?? "").length, `no reason given for ${c.probe}`).toBeGreaterThan(20);
    }
  });

  it("treats only exit 1 as a false positive", () => {
    // 3 is "could not measure" and 0 is clean; counting either would make the
    // check fail on an unreachable page and be turned off within a week.
    expect(SRC).toMatch(/if \(code === 1\) \{\s*\n\s*falsePositives \+= 1;/);
    expect(SRC).toContain("unmeasured += 1");
  });

  it("refuses to report clean when nothing could be measured", () => {
    // An all-inconclusive run means precision is UNKNOWN, not good.
    expect(SRC).toMatch(/if \(measured === 0\)/);
    expect(SRC).toContain("precision is unknown, not clean");
  });

  it("runs in CI and is allowed to fail the job", () => {
    expect(WORKFLOW).toContain("node scripts/probes/precision-check.mjs");
    // No `continue-on-error` on this step: a probe claiming a defect that is
    // not one is a regression in the component the pipeline trusts.
    const step = WORKFLOW.slice(WORKFLOW.indexOf("Probes do not claim defects"));
    expect(step.slice(0, 200)).not.toContain("continue-on-error");
  });
});
