import { describe, expect, it } from "vitest";
import { reportDiscountEmail } from "@/lib/emails/report-discount";
import type { ReportPriceQuoteSnapshot } from "@/lib/pricing/reportPricing";
import type { ReportPurchasePlanId } from "@/lib/checkout/reportPurchase";

function makeQuote(overrides: Partial<ReportPriceQuoteSnapshot>): ReportPriceQuoteSnapshot {
  return {
    id: 1,
    plan: "full_report",
    currency: "EUR",
    experimentGroup: "A",
    basePriceBucket: "B",
    basePriceCents: 5999,
    msrpCents: 5999,
    startingPriceCents: 2999,
    currentPriceCents: 2999,
    initialPriceCents: 2999,
    discountMultiplier: 1,
    discountStep: 0,
    pricingClusterId: "A-full_report-B",
    countryTier: "tier_2",
    countryMultiplier: 1,
    deviceType: "Desktop",
    deviceMultiplier: 1.05,
    trafficSource: "direct",
    trafficMultiplier: 1.1,
    behavioralBucket: "moderate",
    behavioralMultiplier: 1,
    engagementScore: 0,
    engagementMultiplier: 1,
    reportPreviewViews: 0,
    fantasySignalCount: 0,
    surveyDurationMs: null,
    initialPriceTimestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    checkoutStartedAt: null,
    purchasedAt: null,
    viewCount: 0,
    ...overrides,
  };
}

/**
 * Bucket B at step 3 (7d). Under Pricing.xlsx:
 *   Essentials: MSRP 19.99 → starting 14.99 → step-3 (-50%) ⇒ 7.49
 *   Full:       MSRP 59.99 → starting 29.99 → step-3 (-50%) ⇒ 14.99
 *   All:        MSRP 259.00 → starting 129.49 → step-3 (-30% cap) ⇒ 90.99
 */
function makeQuotes(): Partial<Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot>> {
  return {
    essentials: makeQuote({
      plan: "essentials",
      basePriceBucket: "B",
      basePriceCents: 1999,
      msrpCents: 1999,
      startingPriceCents: 1499,
      initialPriceCents: 1499,
      currentPriceCents: 749,
      discountMultiplier: 0.5,
      discountStep: 3,
    }),
    full_report: makeQuote({
      plan: "full_report",
      currentPriceCents: 1499,
      discountMultiplier: 0.5,
      discountStep: 3,
    }),
    all_reports: makeQuote({
      plan: "all_reports",
      basePriceBucket: "B",
      basePriceCents: 25900,
      msrpCents: 25900,
      startingPriceCents: 12949,
      initialPriceCents: 12949,
      currentPriceCents: 9099,
      discountMultiplier: 0.7,
      discountStep: 3,
    }),
  };
}

describe("reportDiscountEmail", () => {
  const baseParams = {
    ctaUrl: "https://loveiq.org/report/rpt_abcdefghijklmnopqrst?offer=1",
    siteUrl: "https://loveiq.org",
  };

  it("uses static discount subject", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "Eman",
      quotes: makeQuotes(),
    });
    expect(result.subject).toBe("Special deal on your personal report");
  });

  it("greets with first name", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "Eman",
      quotes: makeQuotes(),
    });
    expect(result.html).toContain("Hi Eman,");
    expect(result.text).toContain("Hi Eman,");
  });

  it("falls back to 'there' when first name missing or blank", () => {
    const missing = reportDiscountEmail({ ...baseParams, firstName: null, quotes: makeQuotes() });
    const blank = reportDiscountEmail({ ...baseParams, firstName: "   ", quotes: makeQuotes() });
    expect(missing.html).toContain("Hi there,");
    expect(blank.html).toContain("Hi there,");
  });

  it("escapes first name to prevent HTML injection", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "<script>alert(1)</script>",
      quotes: makeQuotes(),
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("embeds CTA URL in both HTML and text bodies", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "Ada",
      quotes: makeQuotes(),
    });
    expect(result.html).toContain(baseParams.ctaUrl);
    expect(result.text).toContain(baseParams.ctaUrl);
  });

  it("renders all three plan blocks with titles + CTA label", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "Ada",
      quotes: makeQuotes(),
    });
    expect(result.html).toContain("Essentials only:");
    expect(result.html).toContain("Full report:");
    expect(result.html).toContain("All 14 reports:");
    expect(result.html).toContain("Secure discount on report");
  });

  it("uses quote.msrpCents as the strike and computes percent off correctly", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "Ada",
      quotes: makeQuotes(),
    });
    // Essentials: strike 19.99 → current 7.49 → saved 12.50 → 63% off.
    expect(result.html).toContain("€19.99");
    expect(result.html).toContain("63% saved");
    expect(result.html).toContain("-12,50€");
    // Full report: strike 59.99 → current 14.99 → saved 45.00 → 75% off.
    expect(result.html).toContain("€59.99");
    expect(result.html).toContain("75% saved");
    expect(result.html).toContain("-45,00€");
    // All reports: strike 259.00 → current 90.99 → saved 168.01 → 65% off.
    expect(result.html).toContain("€259.00");
    expect(result.html).toContain("65% saved");
    expect(result.html).toContain("-168,01€");
  });

  it("falls back to catalogue prices + no savings when quote missing", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "Ada",
      quotes: null,
    });
    // Essentials catalogue fallback (bucket B MSRP) is now €19.99.
    expect(result.html).toContain("€19.99");
    expect(result.html).not.toContain("saved");
  });

  it("renders Why-it's-worth-a-look bullets", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "Ada",
      quotes: makeQuotes(),
    });
    expect(result.html).toContain("Built on psychology + real response patterns");
    expect(result.html).toContain("Practical insights you can actually use");
    expect(result.html).toContain("Private by design");
  });

  it("contains the contact email and sign-off", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "Ada",
      quotes: makeQuotes(),
    });
    expect(result.html).toContain("hello@loveiq.org");
    expect(result.html).toContain("With kindness,");
    expect(result.html).toContain("Your LoveIQ team");
    expect(result.text).toContain("With kindness,");
  });
});
