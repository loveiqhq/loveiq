import { test, expect } from "@playwright/test";

import { mockReport } from "./fixtures/report";

// E2E coverage for the paywall fix that gates the "offer" (extra-discount)
// variant of the pricing modal to the 24h+ ladder step. Below 24h, manual
// section-click opens the modal in default variant. The discount-email
// deep-link (?offer=1) overrides the time gate.

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
    // The paygate (Figma 842:584 / 963:6): both plans, each at its quoted price.
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: /discover your full sexual self/i })
    ).toBeVisible();
    await expect(dialog.locator(".rpg-card--all_reports .rpg-card__amount")).toHaveText("€39.99");
    await expect(dialog.locator(".rpg-card--all_reports .rpg-card__was")).toHaveText(
      "€49.99 - 20% off"
    );
    await expect(dialog.locator(".rpg-card--full_report .rpg-card__amount")).toHaveText("€29.99");
    await expect(dialog.locator(".rpg-card--full_report .rpg-card__was")).toHaveCount(0);
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
