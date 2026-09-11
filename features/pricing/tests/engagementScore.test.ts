import { describe, expect, it } from "vitest";

import { getEngagementScore } from "@features/pricing/logic/reportPricing";

/**
 * This function had no test at all, which is part of how a value derived from Article 9
 * answers came to be computed on every quote, stored against a commercial record and sent
 * onward to Stripe without anything flagging it.
 */
describe("getEngagementScore", () => {
  const base = { fantasySignalCount: 0, previewViews: 0, surveyDurationMs: 0 };

  it("does NOT let sexual-fantasy answers move the score", () => {
    // The point of the change: 03005 / 03010 / 03012 are special-category answers and
    // must not contribute to anything that reaches a payment processor.
    const without = getEngagementScore({ ...base, fantasySignalCount: 0 });
    for (const count of [1, 2, 3]) {
      expect(getEngagementScore({ ...base, fantasySignalCount: count })).toBe(without);
    }
  });

  it("leaves the fantasy count unable to change the score in any combination", () => {
    for (const previewViews of [0, 2]) {
      for (const surveyDurationMs of [0, 9 * 60 * 1000]) {
        const off = getEngagementScore({ ...base, previewViews, surveyDurationMs });
        const on = getEngagementScore({
          ...base,
          previewViews,
          surveyDurationMs,
          fantasySignalCount: 3,
        });
        expect(on).toBe(off);
      }
    }
  });

  it("still scores a long survey", () => {
    expect(getEngagementScore({ ...base, surveyDurationMs: 8 * 60 * 1000 + 1 })).toBe(20);
    expect(getEngagementScore({ ...base, surveyDurationMs: 8 * 60 * 1000 })).toBe(0);
  });

  it("still scores repeat preview views", () => {
    expect(getEngagementScore({ ...base, previewViews: 2 })).toBe(20);
    expect(getEngagementScore({ ...base, previewViews: 1 })).toBe(0);
  });

  it("tops out at 40, below the 40 threshold only when one signal is missing", () => {
    // The engagement multiplier applies at >= 40, so with fantasy removed the score can
    // still reach the threshold on the two behavioural signals alone.
    expect(
      getEngagementScore({
        fantasySignalCount: 0,
        previewViews: 2,
        surveyDurationMs: 9 * 60 * 1000,
      })
    ).toBe(40);
    expect(
      getEngagementScore({
        fantasySignalCount: 9,
        previewViews: 1,
        surveyDurationMs: 9 * 60 * 1000,
      })
    ).toBe(20);
  });

  it("handles a null survey duration", () => {
    expect(getEngagementScore({ ...base, surveyDurationMs: null })).toBe(0);
  });
});
