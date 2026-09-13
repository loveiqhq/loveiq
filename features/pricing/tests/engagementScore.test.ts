import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getEngagementScore } from "@features/pricing/logic/reportPricing";

/**
 * This function had no test at all, which is part of how a value derived from Article 9
 * answers came to be computed on every quote, stored against a commercial record and sent
 * onward to Stripe without anything flagging it.
 */
describe("getEngagementScore", () => {
  const base = { previewViews: 0, surveyDurationMs: 0 };

  it("scores a long survey", () => {
    expect(getEngagementScore({ ...base, surveyDurationMs: 8 * 60 * 1000 + 1 })).toBe(20);
    expect(getEngagementScore({ ...base, surveyDurationMs: 8 * 60 * 1000 })).toBe(0);
  });

  it("scores repeat preview views", () => {
    expect(getEngagementScore({ ...base, previewViews: 2 })).toBe(20);
    expect(getEngagementScore({ ...base, previewViews: 1 })).toBe(0);
  });

  it("tops out at 40 on the two behavioural signals alone", () => {
    // 40 is the engagement-multiplier threshold. With the fantasy component removed the
    // score can still reach it, so removing that component did not disable the mechanism
    // — it only stopped special-category answers feeding it.
    expect(getEngagementScore({ previewViews: 2, surveyDurationMs: 9 * 60 * 1000 })).toBe(40);
  });

  it("handles a null survey duration", () => {
    expect(getEngagementScore({ ...base, surveyDurationMs: null })).toBe(0);
  });
});

/**
 * The real guard. `getEngagementScore` can no longer be handed a fantasy count at all, so
 * a behavioural test cannot express "sexual-preference answers must not reach pricing"
 * any more — the only way to reintroduce the defect is to put one of these question ids
 * back into the list the pricing query reads. That is what this asserts.
 *
 * Source-text rather than behaviour, deliberately: the list is module-private, and
 * exporting it purely to test it would widen the surface that the test exists to keep
 * narrow.
 */
describe("pricing never reads sexual-preference answers", () => {
  const source = readFileSync(
    join(process.cwd(), "features/pricing/logic/reportPricing.ts"),
    "utf-8"
  );
  const declaration = source.match(/const PRICING_SIGNAL_QIDS = \[(.*?)\] as const;/s)?.[1] ?? "";

  it("finds the pricing signal list", () => {
    expect(declaration).not.toBe("");
  });

  it.each(["03005", "03010", "03012"])(
    "does not read %s (Article 9 special-category answer)",
    (qid) => {
      expect(declaration).not.toContain(qid);
    }
  );

  it("reads only country and the behavioural spend band", () => {
    const qids = [...declaration.matchAll(/"(\d+)"/g)].map((m) => m[1]);
    expect(qids.sort()).toEqual(["15001", "16012"]);
  });

  it("never derives a fantasy signal to store on the quote", () => {
    // The column is NOT NULL and still holds historical values, so the write stays — but
    // it must be a hardcoded 0, never a value computed from an answer.
    expect(source).toMatch(/fantasy_signal_count: 0,/);
    expect(source).not.toMatch(/fantasy_signal_count: context\./);
    expect(source).not.toMatch(/const fantasySignalCount = /);
  });
});
