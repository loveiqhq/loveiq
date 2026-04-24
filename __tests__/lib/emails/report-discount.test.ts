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
    basePriceBucket: "full_center",
    basePriceCents: 2999,
    currentPriceCents: 2999,
    initialPriceCents: 2999,
    discountMultiplier: 1,
    discountStep: 0,
    pricingClusterId: "A-full_report-test",
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

function makeQuotes(): Partial<Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot>> {
  return {
    // All three rowed at discount_step 2 (-50%). For Essentials strike 1499,
    // current 749 → 50% off, 7.49 saved. For Full strike 5900, current 1499
    // → 74% off (realistic ladder + anchor combo). For All strike 19000,
    // current 6499 → 66% off.
    essentials: makeQuote({
      plan: "essentials",
      currentPriceCents: 749,
      discountMultiplier: 0.5,
      discountStep: 2,
    }),
    full_report: makeQuote({
      plan: "full_report",
      currentPriceCents: 1499,
      discountMultiplier: 0.5,
      discountStep: 2,
    }),
    all_reports: makeQuote({
      plan: "all_reports",
      currentPriceCents: 6499,
      discountMultiplier: 0.5,
      discountStep: 2,
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
    expect(result.html).toContain("All reports:");
    expect(result.html).toContain("Secure discount on report");
  });

  it("computes saved amount and percent off from strike vs current quote", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "Ada",
      quotes: makeQuotes(),
    });
    // Full report: strike 59.00 → current 14.99 → saved 44.01 → 75% off.
    expect(result.html).toContain("€44.01 saved");
    expect(result.html).toContain("-75%");
    // All reports: strike 190.00 → current 64.99 → saved 125.01 → 66% off.
    expect(result.html).toContain("€125.01 saved");
    expect(result.html).toContain("-66%");
    // Essentials: strike 14.99 → current 7.49 → saved 7.50 → 50% off.
    expect(result.html).toContain("€7.50 saved");
    expect(result.html).toContain("-50%");
  });

  it("falls back to catalogue prices + no savings when quote missing", () => {
    const result = reportDiscountEmail({
      ...baseParams,
      firstName: "Ada",
      quotes: null,
    });
    // Essentials strike = current = €14.99 → no savings rendered.
    expect(result.html).toContain("€14.99");
    expect(result.html).not.toContain("€7.50 saved");
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
