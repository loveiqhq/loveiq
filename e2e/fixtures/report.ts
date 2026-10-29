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

/**
 * The guided tour runs over each V4 report on its first open in a browser, and every test
 * starts in a fresh one. Specs about the page under it open a report that has shown it;
 * the tour's own spec asks for it with `{ tour: true }`. The record is the tour's own, one
 * per report (features/report/logic/guidedTour.ts, GUIDED_TOUR_KEY and guidedTourKey).
 */
export const GUIDED_TOUR_KEY = "loveiq-report-tour-v1";

/** One report's record, as guidedTourKey names it. A preview's is kept for the tab only. */
export const guidedTourKey = (submissionId: number | null) =>
  `${GUIDED_TOUR_KEY}:${submissionId ?? "preview"}`;

/**
 * What /api/report answers a reader the EUR 1.99 gate stops, in place of the report
 * (features/report/logic/initialUnlockGate.ts, buildInitialUnlockGatePayload).
 */
export function buildInitialGateFixture(reportToken: string) {
  return {
    gate: "initial_unlock",
    priceCents: 199,
    currency: "EUR",
    creditCents: 1000,
    guaranteeDays: 14,
    reportToken,
    submissionId: 1,
    viewMode: "owner",
    surveyMinutes: 14,
  };
}

export async function mockReport(
  page: Page,
  discountStep: number,
  overrides: Record<string, unknown> = {},
  { tour = false }: { tour?: boolean } = {}
) {
  const report = buildReportFixture(discountStep, overrides);
  if (!tour) {
    const submissionId = typeof report.submissionId === "number" ? report.submissionId : null;
    await page.addInitScript(
      ({ key, tabOnly }) => {
        try {
          (tabOnly ? window.sessionStorage : window.localStorage).setItem(key, "seen");
        } catch {
          // No storage: then the tour cannot remember itself and never starts either.
        }
      },
      { key: guidedTourKey(submissionId), tabOnly: submissionId === null }
    );
  }
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(report),
    });
  });
}
