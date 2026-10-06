import type { Page } from "@playwright/test";

/**
 * A report the page can render without a database: the shape /api/report
 * returns, with pricing quotes for the two Pricing 3.0 plans. Shared by the specs that
 * drive the paywall, so a field the page starts requiring is added once.
 */
export const PRIMARY_ARCHETYPE = "Emotional Voyeur";

export function buildPricingQuote(plan: "full_report" | "all_reports", discountStep: number) {
  // Pricing 3.0, arm A3: "All 14" €39.99 (strike €49.99), the single report €29.99.
  const msrp = plan === "all_reports" ? 4999 : 2999;
  const charged = plan === "all_reports" ? 3999 : 2999;
  return {
    id: plan === "full_report" ? 2 : 3,
    plan,
    currency: "EUR",
    experimentGroup: "A3",
    basePriceBucket: "A3",
    basePriceCents: msrp,
    msrpCents: msrp,
    startingPriceCents: charged,
    currentPriceCents: charged,
    // Every price surface reads `chargedPriceCents`; without it the cards read "€NaN".
    chargedPriceCents: charged,
    initialPriceCents: charged,
    discountMultiplier: discountStep === 0 ? 1 : 0.9,
    discountStep,
    pricingClusterId: `A3-${plan}-A3-tier_2-desktop-direct-zero-standard-d${discountStep}`,
    countryTier: "tier_2",
    countryMultiplier: 1,
    deviceType: "Desktop",
    deviceMultiplier: 1,
    trafficSource: "direct",
    trafficMultiplier: 1,
    behavioralBucket: "zero",
    behavioralMultiplier: 1,
    engagementScore: 0,
    engagementMultiplier: 1,
    reportPreviewViews: 0,
    surveyDurationMs: 600000,
    initialPriceTimestamp:
      discountStep === 0
        ? new Date().toISOString()
        : new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
    checkoutStartedAt: null,
    purchasedAt: null,
    viewCount: 1,
  };
}

export function buildReportFixture(discountStep: number, overrides: Record<string, unknown> = {}) {
  return {
    submissionId: 1,
    accessPlan: null,
    userName: "Test",
    userEmail: "test@example.com",
    primaryArchetype: PRIMARY_ARCHETYPE,
    percentages: { [PRIMARY_ARCHETYPE]: 60, "Explorer of Edges": 40 },
    reportDate: "2026-05-07T12:00:00.000Z",
    diagnostics: {
      overlaysScalar: { OVL_SATISFACTION: 0.5, OVL_TOPIC_IMPORTANCE: 0.5 },
      overlaysEnum: { OVL_PHASE_NOW: "grounded" },
    },
    snapshotAnswers: { currentSexualSatisfaction: 3, importanceOfSex: 5 },
    pricingQuotes: {
      full_report: buildPricingQuote("full_report", discountStep),
      all_reports: buildPricingQuote("all_reports", discountStep),
    },
    unlockedArchetypes: [PRIMARY_ARCHETYPE],
    archetypeTiers: {},
    archetypeContent: {},
    practiceTendencies: {},
    ...overrides,
  };
}

export async function mockReport(
  page: Page,
  discountStep: number,
  overrides: Record<string, unknown> = {}
) {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildReportFixture(discountStep, overrides)),
    });
  });
}
