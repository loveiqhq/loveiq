import { test, expect } from "@playwright/test";

/**
 * Regression, 2026-10-04: answering the homepage question card and pressing "Continue to the
 * survey" opened question 1 directly, past the 18+ / terms / sensitive-data consent screen,
 * while the server stamps consent on every submission. No spec drove the card into the
 * survey, which is how it went unnoticed.
 */
test.describe("Homepage question card", () => {
  test("leads to the consent screen, then to the questions with its answer kept", async ({
    page,
  }) => {
    for (const p of [
      "**/api/survey",
      "**/api/survey-partial",
      "**/api/survey-tracking",
      "**/api/funnel-event",
      "**/api/analytics-event",
    ]) {
      await page.route(p, (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: "{}" })
      );
    }
    // Arm A: the hero card. On arm B the first card on the page is the closing one,
    // which would pass this by accident.
    await page.goto("/?variant=white_card");
    const dot = page.getByRole("button", { name: /^4 of 7/ }).first();
    await dot.scrollIntoViewIfNeeded();
    await dot.click();
    await page.getByRole("link", { name: "Continue to the survey" }).first().click();

    await expect(page.getByRole("heading", { name: /before we begin/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("progressbar", { name: "Survey progress" })).toHaveCount(0);

    await page.getByRole("checkbox").first().click();
    // The terms label holds links; click its indicator, not the text.
    await page.getByRole("checkbox").nth(1).locator("div").first().click();
    await page.getByRole("button", { name: /i agree/i }).click();

    await expect(page.getByRole("heading", { name: "What is your name?" })).toBeVisible({
      timeout: 15_000,
    });
    const kept = await page.evaluate(
      () => JSON.parse(localStorage.getItem("loveiq-survey-answers") || "{}").answers?.["01002"]
    );
    expect(kept).toBe(4);
  });
});
