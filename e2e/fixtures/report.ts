import type { Page } from "@playwright/test";

/**
 * A report the page can render without a database: the shape /api/report
 * returns, with pricing quotes for all three plans. Shared by the specs that
 * drive the paywall, so a field the page starts requiring is added once.
 */
export const PRIMARY_ARCHETYPE = "Emotional Voyeur";

export function buildPricingQuote(
  plan: "essentials" | "full_report" | "all_reports",
  discountStep: number
) {
  return {
    id: plan === "essentials" ? 1 : plan === "full_report" ? 2 : 3,
    plan,
    currency: "EUR",
    experimentGroup: "B",
    basePriceBucket: "B",
    // Pricing 2.0 Group-B base values (boosts paused → no decay ladder, so
    // current = starting). msrp = the strike anchor; essentials is grandfathered.
    basePriceCents: plan === "all_reports" ? 5800 : plan === "full_report" ? 2900 : 2999,
    msrpCents: plan === "all_reports" ? 5800 : plan === "full_report" ? 2900 : 2999,
    startingPriceCents: plan === "all_reports" ? 4900 : plan === "full_report" ? 2900 : 999,
    currentPriceCents: plan === "all_reports" ? 4900 : plan === "full_report" ? 2900 : 999,
    // The urgency window is unarmed in these fixtures, so the charged price is the base
    // one. Without these three the modal renders "€NaN": every price surface reads
    // `chargedPriceCents`, not `currentPriceCents`.
    chargedPriceCents: plan === "all_reports" ? 4900 : plan === "full_report" ? 2900 : 999,
    initialPriceCents: plan === "all_reports" ? 4900 : plan === "full_report" ? 2900 : 999,
    discountMultiplier: discountStep === 0 ? 1 : 0.9,
    discountStep,
    pricingClusterId: `B-${plan}-B-tier_2-desktop-direct-zero-standard-d${discountStep}`,
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
      essentials: buildPricingQuote("essentials", discountStep),
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
