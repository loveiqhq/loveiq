import { describe, expect, it } from "vitest";

import {
  UX_REVIEW_ESTIMATED_MONTHLY_CREDITS,
  UX_REVIEW_MIN_CONFIDENCE,
  UX_SCANNERS,
} from "../server/scanners";

/**
 * This is the test that makes the review protocol explicit rather than a vibe.
 *
 * Marcus's requirement on 2026-09-11 was that the criteria "must be explicitly
 * defined and benchmarked against test videos so the team does not rely on false
 * confidence". Benchmarking is a separate harness; this half asserts the criteria
 * are actually IN the prompts, so quietly dropping one fails CI instead of
 * silently narrowing what the agent watches for.
 */
describe("UX review scanners", () => {
  it("every scanner is uniquely named and fully configured", () => {
    const names = UX_SCANNERS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of UX_SCANNERS) {
      expect(s.prompt.length, `${s.name}: empty prompt`).toBeGreaterThan(200);
      expect(s.triggerEvent, `${s.name}: no trigger event`).toBeTruthy();
      expect(Number.isInteger(s.scannerVersion)).toBe(true);
      // The cap must leave headroom over the measured spend, or the scanner
      // stops mid-period for no reason.
      expect(s.creditLimit, `${s.name}: cap below its own estimate`).toBeGreaterThanOrEqual(
        s.estimatedMonthlyCredits
      );
    }
  });

  it("every scanner states a negative class and demands a citation", () => {
    for (const s of UX_SCANNERS) {
      // Without an explicit "do not flag" list a scanner drifts towards
      // answering YES to everything, which is the false-confidence failure.
      expect(s.prompt, `${s.name}: no negative class`).toContain("Do NOT answer YES for");
      expect(s.prompt.toLowerCase(), `${s.name}: no citation demand`).toContain("cite the moment");
    }
  });

  it("keeps the criteria Marcus named — error messages and loops", () => {
    // Named explicitly in the 2026-09-11 sync: "explicit triggers like error
    // messages or user loops".
    const surveyAndReport = UX_SCANNERS.filter((s) =>
      ["survey_started", "report_viewed"].includes(s.triggerEvent)
    );
    expect(surveyAndReport).toHaveLength(2);
    for (const s of surveyAndReport) {
      expect(s.prompt, `${s.name}: lost the error-message criterion`).toContain(
        "Unable to process request."
      );
      expect(s.prompt, `${s.name}: lost the loop criterion`).toContain("LOOP");
    }
  });

  it("keeps excessive scrolling on the report, where it is measurable", () => {
    const report = UX_SCANNERS.find((s) => s.triggerEvent === "report_viewed");
    expect(report?.prompt).toContain("EXCESSIVE SCROLLING");
    // And nowhere else: the survey is one question per screen, so a scroll rule
    // there is noise, not signal.
    const survey = UX_SCANNERS.find((s) => s.triggerEvent === "survey_started");
    expect(survey?.prompt).not.toContain("EXCESSIVE SCROLLING");
  });

  it("carries the design tokens it judges against", () => {
    // Quoted from app/globals.css :root. If a token is rebranded, these fail and
    // the prompts get updated with it instead of silently judging the old brand.
    for (const s of UX_SCANNERS) {
      expect(s.prompt, `${s.name}: lost the surface token`).toContain("#0b0613");
      expect(s.prompt, `${s.name}: lost the accent tokens`).toContain("#f26d4f");
      expect(s.prompt).toContain("#9c7dff");
      expect(s.prompt, `${s.name}: lost the iOS zoom threshold`).toContain("16px");
    }
  });

  it("projects a spend the operator has actually agreed to", () => {
    // 4,782 credits/month measured 2026-09-14 against 7 real days. The free
    // allowance is 2,500, so this deliberately requires a card. If an edit pushes
    // it materially higher, that should be a conscious decision, not a surprise.
    expect(UX_REVIEW_ESTIMATED_MONTHLY_CREDITS).toBeLessThanOrEqual(5000);
    expect(UX_REVIEW_MIN_CONFIDENCE).toBeGreaterThanOrEqual(0.7);
  });
});
