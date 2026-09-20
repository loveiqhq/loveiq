import { describe, expect, it } from "vitest";

import {
  UX_REVIEW_CHALLENGER_MONTHLY_CREDITS,
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
    // CHAMPIONS only. A challenger is a duplicate on the same trigger event,
    // deliberately phrased differently — the observation-only one has no "LOOP"
    // keyword because it is forbidden from naming causes at all. Scoping here
    // keeps this guard exactly as strong for every scanner that speaks to the
    // team, which is what "the criteria Marcus named" has always meant.
    const surveyAndReport = UX_SCANNERS.filter(
      (s) => s.role === "champion" && ["survey_started", "report_viewed"].includes(s.triggerEvent)
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
    // By role, not by first match: two scanners now watch report_viewed, and
    // `find` silently returning the challenger would test the wrong prompt.
    const report = UX_SCANNERS.find(
      (s) => s.role === "champion" && s.triggerEvent === "report_viewed"
    );
    expect(report?.prompt).toContain("EXCESSIVE SCROLLING");
    // And nowhere else: the survey is one question per screen, so a scroll rule
    // there is noise, not signal.
    const survey = UX_SCANNERS.find(
      (s) => s.role === "champion" && s.triggerEvent === "survey_started"
    );
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

    /**
     * AND THE COMBINED BILL, or splitting the constant would have moved the
     * ceiling instead of respecting it.
     *
     * The line above now covers champions only, so that a temporary experiment
     * cannot quietly inflate the number an operator agreed to. That is only
     * honest if what is actually charged stays bounded too — otherwise the
     * split is a way to make any spend pass. 6,000 leaves room for one
     * challenger (574) on top of the fleet (4,782) and stays well under
     * PostHog's 7,500 hard stop; a second concurrent experiment should be a
     * decision someone makes here, not a surprise on the invoice.
     */
    expect(
      UX_REVIEW_ESTIMATED_MONTHLY_CREDITS + UX_REVIEW_CHALLENGER_MONTHLY_CREDITS,
      "champions plus challengers is what actually gets billed"
    ).toBeLessThanOrEqual(6000);
  });
});
