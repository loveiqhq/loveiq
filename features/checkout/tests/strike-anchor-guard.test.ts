// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  getReportPurchaseBadgeFromPrice,
  getReportPurchaseSaveCents,
  getReportPurchaseStrikePrice,
} from "@features/checkout/server/reportPurchase";

/**
 * The struck-through anchor must never advertise a saving nobody is getting.
 *
 * Written for the +2 EUR urgency surcharge (removed 2026-08-31), which could push a
 * charged price above its own anchor — a card reading "€31.00" beside a struck-through
 * "€29.00". The surcharge is gone but the rule outlives it: some live buckets are
 * priced AT their own MSRP, and any future price edit can reintroduce the case. The
 * failure is silent — the strike, the "Save €X" row and the "N% OFF" pill all just
 * vanish, with no error anywhere.
 */
describe("strike, badge and save agree about a truthful anchor", () => {
  it("keeps the anchor while it is above the charged price", () => {
    expect(getReportPurchaseStrikePrice(4999, 1699)).toBe("€49.99");
    expect(getReportPurchaseBadgeFromPrice({ strikeCents: 4999, currentCents: 1699 })).toBe(
      "66% OFF"
    );
    expect(getReportPurchaseSaveCents({ strikeCents: 4999, currentCents: 1699 })).toBe(3300);
  });

  it("drops the anchor when the charged price overtakes it", () => {
    expect(getReportPurchaseStrikePrice(2900, 3100)).toBeNull();
    expect(getReportPurchaseBadgeFromPrice({ strikeCents: 2900, currentCents: 3100 })).toBeNull();
    expect(getReportPurchaseSaveCents({ strikeCents: 2900, currentCents: 3100 })).toBeNull();
  });

  it("drops the anchor when it exactly equals the charged price", () => {
    expect(getReportPurchaseStrikePrice(2900, 2900)).toBeNull();
    expect(getReportPurchaseSaveCents({ strikeCents: 2900, currentCents: 2900 })).toBeNull();
  });

  it("still formats an anchor for callers with no price to compare against", () => {
    // The checkout page renders a strike from the static catalogue before its quote
    // arrives; that call has nothing to compare and must keep working.
    expect(getReportPurchaseStrikePrice(4999)).toBe("€49.99");
    expect(getReportPurchaseStrikePrice(0)).toBeNull();
    expect(getReportPurchaseStrikePrice(null)).toBeNull();
  });

  it("the discount percentage shrinks rather than lying", () => {
    // Same anchor, a dearer price: 70% off becomes 66% off. The badge is derived from
    // the charged price, so it cannot advertise a discount nobody is getting.
    expect(getReportPurchaseBadgeFromPrice({ strikeCents: 4999, currentCents: 1499 })).toBe(
      "70% OFF"
    );
    expect(getReportPurchaseBadgeFromPrice({ strikeCents: 4999, currentCents: 1699 })).toBe(
      "66% OFF"
    );
  });
});

/**
 * The same guard driven off the LIVE catalogue rather than illustrative numbers, so a
 * future price edit cannot quietly break the anchor. Deliberately asserts the RULE
 * (strike present exactly when the anchor beats the price, and the badge agreeing with
 * it) instead of a hardcoded table of percentages, which would have to be rewritten on
 * every repricing and would not actually be checking anything else.
 */
describe("every live bucket has a truthful anchor", () => {
  const plans = ["full_report", "core", "all_reports"] as const;

  it.each(plans)("%s", async (plan) => {
    const { getPricingBucketsForPlan } = await import("@features/pricing/logic/reportPricing");
    const buckets = getPricingBucketsForPlan(plan);
    expect(buckets.length).toBeGreaterThan(0);

    for (const bucket of buckets) {
      const charged = bucket.startingCents;
      const anchorIsReal = bucket.msrpCents > charged;
      const label = `${plan} bucket ${bucket.code}`;

      expect(getReportPurchaseStrikePrice(bucket.msrpCents, charged) !== null, label).toBe(
        anchorIsReal
      );
      // Strike and badge are driven by the same guard, so they must agree: either both
      // present or both gone. A strike without a badge is the misleading case.
      expect(
        getReportPurchaseBadgeFromPrice({
          strikeCents: bucket.msrpCents,
          currentCents: charged,
        }) !== null,
        label
      ).toBe(anchorIsReal);
      expect(
        getReportPurchaseSaveCents({ strikeCents: bucket.msrpCents, currentCents: charged }) !==
          null,
        label
      ).toBe(anchorIsReal);
    }
  });
});
