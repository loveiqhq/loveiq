/**
 * One run may open at most a couple of draft pull requests.
 *
 * The per-branch check in replay-pr.mjs stops the SAME reproduction opening a
 * second PR, but nothing bounded the total, and the blast radius grew on
 * 2026-09-19 when findings began being synthesised from our own dead_click
 * events: a run can now carry 25 of them and spend its whole probe budget on
 * one criterion.
 *
 * The shape this guards against is not theoretical. That same day
 * verify-dead-click-target.mjs reported the survey consent gate as a defect
 * because its button is deliberately disabled — correct behaviour, reproduced
 * convincingly, and D1 is in AUTO_PR_CRITERIA. The probe was fixed; "a probe
 * that is wrong in a way that reproduces" is now a known shape.
 *
 * Source assertions because the verifier is a script with top-level await that
 * runs on import — the technique verifier-budget.test.ts uses for this file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "scripts/verify-ux-findings.mjs"), "utf8");

describe("the per-run cap on draft pull requests", () => {
  it("has a small default", () => {
    const n = Number(
      /MAX_PRS_PER_RUN = Number\(process\.env\.MAX_PRS_PER_RUN \?\? (\d+)\)/.exec(SRC)?.[1]
    );
    expect(n).toBeGreaterThan(0);
    expect(n, "a large cap is not a cap").toBeLessThanOrEqual(3);
  });

  it("checks the cap BEFORE opening, not after", () => {
    // Counting afterwards would let every finding in the run through first.
    const gate = SRC.indexOf("prsOpened >= MAX_PRS_PER_RUN");
    const call = SRC.indexOf("openReproductionPr({ criterion");
    expect(gate).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(-1);
    expect(gate, "the cap is checked after the PR is opened").toBeLessThan(call);
  });

  it("counts an actual PR, never a no-op attempt", () => {
    // openReproductionPr returns null when the flag is off or the branch
    // exists. Counting those would spend the cap on runs that opened nothing.
    expect(SRC).toMatch(/if \(prUrl\) prsOpened \+= 1;/);
  });

  it("reports a held-back PR instead of dropping it silently", () => {
    expect(SRC).toContain("prsSkipped");
    expect(SRC).toMatch(/held back by the cap/);
  });
});
