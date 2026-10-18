import { test, expect, type Page } from "@playwright/test";

import { instantScroll } from "./fixtures/instant-scroll";

/**
 * Pay to start on a real build (features/pay-to-start): the assessment page, its checkout
 * button, the status page Stripe returns to, and the way into the survey. Stripe and the
 * two pay-to-start APIs are stood in for with page.route, so nothing is charged and no
 * database is needed: what is under test is the pages and the browser's way through them.
 *
 * The build has no PAY_TO_START_PRICE_CENTS, so the page sells at the default EUR 29.
 */
const PAGE = "/sexual-archetype";
const SESSION = "cs_test_e2eAbcdefghijKLMN";
const purchase = {
  value: 29,
  currency: "EUR",
  transaction_id: SESSION,
  item_name: "LoveIQ Survey & Report",
  isTest: true,
};

async function openPage(page: Page, path = PAGE) {
  await instantScroll(page);
  // The banner would sit over the bar on a phone, as it would for a visitor who has not
  // answered it; these cases are about the page, so it is kept out.
  await page.route("**/cdn-cookieyes.com/**", (route) => route.abort());
  await page.route("**/api/funnel-event", (route) => route.fulfill({ status: 204, body: "" }));
  await page.goto(path);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

/** The checkout API answers with the status page, as Stripe's success_url would land. */
async function stubCheckout(page: Page, onPost?: () => void) {
  await page.route("**/api/stripe/pay-to-start", (route) => {
    onPost?.();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state: "redirect",
        url: new URL(`${PAGE}/checkout?session_id=${SESSION}`, page.url()).href,
      }),
    });
  });
}

/** The one visible "Unlock survey & report" for this viewport: the card, or the bar. */
async function primaryCta(page: Page) {
  const card = page.locator('[data-pts-cta="price_card"]');
  return (await card.isVisible()) ? card : page.locator('[data-pts-cta="sticky_bar"]');
}

test.describe("pay to start: the assessment page", () => {
  test("stays out of the index", async ({ page }) => {
    await openPage(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("shows its price, and a way to pay above the fold", async ({ page }) => {
    await openPage(page);
    await expect(page.locator("h1")).toHaveText("What’s my sexual archetype?");
    const cta = await primaryCta(page);
    await expect(cta).toBeInViewport();
    await expect(page.getByText("€29", { exact: true }).first()).toBeVisible();
  });

  test("keeps the price in view while the page scrolls", async ({ page }) => {
    await openPage(page);
    await page.evaluate(() => window.scrollTo(0, 3000));
    const cta = await primaryCta(page);
    await expect(cta).toBeInViewport();
  });

  test("goes from the button to the survey through the status page", async ({ page }) => {
    let posts = 0;
    await stubCheckout(page, () => (posts += 1));
    await page.route("**/api/stripe/pay-to-start/status**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ state: "paid", purchase }),
      })
    );
    await page.route("**/survey", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Survey</h1>" })
    );
    await openPage(page);
    const cta = await primaryCta(page);
    await cta.click();

    await expect(page).toHaveURL(/\/sexual-archetype\/checkout/);
    await expect(page.getByText("Payment complete.")).toBeVisible();
    // The session id leaves the address once read.
    await expect(page).toHaveURL(/\/sexual-archetype\/checkout$/);
    await page.waitForURL(/\/survey$/);
    expect(posts).toBe(1);
  });

  test("sends one request however often the button is pressed", async ({ page }) => {
    let posts = 0;
    await page.route("**/api/stripe/pay-to-start", async (route) => {
      posts += 1;
      // Never answers: the page must wait on this one request.
      await new Promise(() => {});
      await route.abort();
    });
    await openPage(page);
    const cta = await primaryCta(page);
    await cta.click();
    await expect(cta).toBeDisabled();
    await cta.click({ force: true });
    expect(posts).toBe(1);
  });

  test("says no payment was taken after Stripe's back link, and cleans the address", async ({
    page,
  }) => {
    await openPage(page, `${PAGE}?checkout=cancelled`);
    await expect(page.getByText(/No payment was taken/)).toBeVisible();
    await expect(page).toHaveURL(/\/sexual-archetype$/);
  });

  test("says why when checkout is paused", async ({ page }) => {
    await page.route("**/api/stripe/pay-to-start", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          state: "unavailable",
          message: "Checkout is paused for a moment. Please try again later.",
        }),
      })
    );
    await openPage(page);
    const cta = await primaryCta(page);
    await cta.click();
    // Next's route announcer is an (empty) alert too.
    await expect(
      page.getByRole("alert").filter({ hasText: "Checkout is paused for a moment." })
    ).toBeVisible();
    await expect(cta).toBeEnabled();
  });
});
