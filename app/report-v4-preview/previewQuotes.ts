import {
  getPricingBucketsForPlan,
  type ReportPriceQuotes,
  type ReportPriceQuoteSnapshot,
} from "@features/pricing/logic/reportPricing";
import { OFFERED_REPORT_PURCHASE_PLAN_IDS } from "@features/checkout/server/reportPurchase";

/**
 * Undiscounted price quotes for the staging preview, and ONLY for it.
 *
 * `ReportPricingModal` needs a quote per plan or every card reads "Pricing
 * unavailable" over a red "Live pricing couldn't be loaded" alert — which is the
 * designed fallback for a real outage, and would read as a bug in a design review.
 * But a real quote cannot exist here: `getReportPriceQuotesForContext` resolves a
 * pricing context from a report token or session id and returns null without one,
 * and this route is deliberately token-free and database-free. Calling it would
 * also WRITE — it inserts a `report_price_quote` row and the paywall path marks it
 * reached, so a design review would move the live discount ladder.
 *
 * So the numbers come from the repository's own price table via
 * `getPricingBucketsForPlan`: the real MSRP and the real starting price, with no
 * discount ladder applied (`discountStep: 0`, `discountMultiplier: 1`). What the
 * preview shows is therefore a true LIST price — the most a reader would ever be
 * asked — not an invented one. Every remaining field is a neutral placeholder, and
 * `id: 0` is inert because the preview's checkout callback does not call Stripe.
 *
 * Pricing 3.0 has two lists, so the preview shows arm A3's: the prices the paygate
 * frames are drawn with (Figma 842:584 / 963:6).
 */
export function buildPreviewQuotes(now = new Date()): ReportPriceQuotes {
  const stamp = now.toISOString();
  const entries = OFFERED_REPORT_PURCHASE_PLAN_IDS.map((plan) => {
    const bucket = getPricingBucketsForPlan(plan).find((entry) => entry.code === "A3")!;
    const price = bucket.startingCents;
    return [
      plan,
      {
        id: 0,
        plan,
        currency: "EUR",
        experimentGroup: "A3",
        basePriceBucket: bucket.code,
        basePriceCents: price,
        msrpCents: bucket.msrpCents,
        startingPriceCents: price,
        currentPriceCents: price,
        initialPriceCents: price,
        chargedPriceCents: price,
        discountMultiplier: 1,
        discountStep: 0,
        pricingClusterId: "preview",
        countryTier: "preview",
        countryMultiplier: 1,
        deviceType: "iOS",
        deviceMultiplier: 1,
        trafficSource: "direct",
        trafficMultiplier: 1,
        behavioralBucket: "zero",
        behavioralMultiplier: 1,
        engagementScore: 0,
        engagementMultiplier: 1,
        reportPreviewViews: 0,
        surveyDurationMs: null,
        initialPriceTimestamp: stamp,
        expiresAt: stamp,
        checkoutStartedAt: null,
        purchasedAt: null,
        viewCount: 0,
      } satisfies ReportPriceQuoteSnapshot,
    ] as const;
  });

  return Object.fromEntries(entries) as ReportPriceQuotes;
}
