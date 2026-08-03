import { test, expect, type Page } from "@playwright/test";

// E2E coverage for the paywall fix that gates the "offer" (extra-discount)
// variant of the pricing modal to the 24h+ ladder step. Below 24h, manual
// section-click opens the modal in default variant. The discount-email
// deep-link (?offer=1) overrides the time gate.

const PRIMARY_ARCHETYPE = "Emotional Voyeur";

function buildPricingQuote(
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
    fantasySignalCount: 0,
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

function buildReportFixture(discountStep: number) {
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
  };
}

async function mockReport(page: Page, discountStep: number) {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildReportFixture(discountStep)),
    });
  });
}

test.describe("Pricing modal — offer variant gated to 24h+", () => {
  test("step 0 (under 24h): modal does not auto-open and section click opens default variant", async ({
    page,
  }) => {
    await mockReport(page, 0);

    await page.goto("/report/test-token-step-0");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });

    await expect(page.locator(".report-pricing-modal")).toHaveAttribute("data-state", "closed", {
      timeout: 5000,
    });

    const lockedCta = page.locator(".report-section .report-premium-overlay__cta").first();
    await expect(lockedCta).toBeVisible();
    await lockedCta.click();

    await expect(page.locator(".report-pricing-modal")).toHaveAttribute("data-state", "open");
    await expect(page.locator(".report-pricing-modal")).toHaveAttribute("data-variant", "default");
    await expect(page.locator(".report-pricing-card__extra-pill")).toHaveCount(0);
  });

  test("step 1 (24h+): modal auto-opens in offer variant", async ({ page }) => {
    await mockReport(page, 1);

    await page.goto("/report/test-token-step-1");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });

    await expect(page.locator(".report-pricing-modal")).toHaveAttribute("data-state", "open", {
      timeout: 5000,
    });
    await expect(page.locator(".report-pricing-modal")).toHaveAttribute("data-variant", "offer");
  });

  test("?offer=1 forces offer variant even at step 0 (email deep-link override)", async ({
    page,
  }) => {
    await mockReport(page, 0);

    await page.goto("/report/test-token-step-0?offer=1");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });

    await expect(page.locator(".report-pricing-modal")).toHaveAttribute("data-state", "open", {
      timeout: 5000,
    });
    await expect(page.locator(".report-pricing-modal")).toHaveAttribute("data-variant", "offer");
  });
});
