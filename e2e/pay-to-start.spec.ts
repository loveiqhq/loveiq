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

interface CheckoutPost {
  method: string;
  csrf: string | null;
  body: Record<string, unknown>;
}

/**
 * The checkout API answers with the status page, as Stripe's success_url would land. Each
 * request is handed to `onPost` as sent, so a test can hold the page to what the real
 * route checks (the CSRF header, the offer, the price it showed).
 */
async function stubCheckout(page: Page, onPost?: (post: CheckoutPost) => void) {
  await page.route("**/api/stripe/pay-to-start", (route) => {
    const request = route.request();
    onPost?.({
      method: request.method(),
      csrf: request.headers()["x-csrf-token"] ?? null,
      body: (request.postDataJSON() ?? {}) as Record<string, unknown>,
    });
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

  test("goes from the button to the survey through the status page", async ({
    page,
    browserName,
  }) => {
    const posts: CheckoutPost[] = [];
    const polled: string[] = [];
    await stubCheckout(page, (post) => posts.push(post));
    await page.route("**/api/stripe/pay-to-start/status**", (route) => {
      polled.push(new URL(route.request().url()).searchParams.get("session_id") ?? "");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ state: "paid", purchase }),
      });
    });
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
    // What the real route checks: a POST with the CSRF header, the offer and the price shown.
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      method: "POST",
      body: { offer: "full", displayedPriceCents: 2900 },
    });
    // The header is the page's CSRF cookie. WebKit refuses that Secure cookie on
    // http://localhost (production is https), so there it has none to send.
    const csrfCookie = (await page.context().cookies()).find((c) => c.name.endsWith("csrf"));
    if (browserName !== "webkit") expect(csrfCookie?.value).toBeTruthy();
    expect(posts[0]!.csrf ?? "").toBe(csrfCookie?.value ?? "");
    // The status page asks about the session Stripe sent back, and nothing else.
    expect(polled.length).toBeGreaterThan(0);
    expect(new Set(polled)).toEqual(new Set([SESSION]));
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
    const selector = `[data-pts-cta="${await cta.getAttribute("data-pts-cta")}"]`;
    // Three presses in one task, before React can disable the button: only the in-flight
    // guard stands between them and three checkouts.
    await page.evaluate((sel) => {
      const button = document.querySelector<HTMLButtonElement>(sel)!;
      button.click();
      button.click();
      button.click();
    }, selector);
    await expect(cta).toBeDisabled();
    await page.waitForTimeout(500);
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

test.describe("pay to start: the LoveIQ header", () => {
  // Marcus, 18.10: the LoveIQ logo and the site's own header sections. Its button takes the
  // visitor to this page's price (Fatih, 19.10), never into the free survey.
  test("carries the site's sections, and its button goes to the price", async ({ page }) => {
    const surveyRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/survey") surveyRequests.push(request.url());
    });
    await openPage(page);
    await expect(page).toHaveTitle(/\| LoveIQ$/);
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "LoveIQ" })).toHaveAttribute("href", "/");

    const sections = ["Home", "About us", "Glossary", "Trust Center"];
    const hamburger = page.getByRole("button", { name: "Open menu" });
    const onAPhone = await hamburger.isVisible();
    if (onAPhone) {
      await hamburger.click();
      const menu = page.locator(".w-menu-panel");
      for (const name of sections) await expect(menu.getByRole("link", { name })).toBeVisible();
      // The menu's own button: the menu lets go of the page first, then it jumps.
      await menu.getByRole("link", { name: "Start test now", exact: true }).click();
      await expect(page.locator(".w-menu-panel.is-open")).toHaveCount(0);
    } else {
      const bar = header.locator("nav");
      // From 1024 wide, as on the site; between 640 and 1023 the bar has the logo and button only.
      if ((page.viewportSize()?.width ?? 0) >= 1024) {
        for (const name of sections) await expect(bar.getByRole("link", { name })).toBeVisible();
      }
      await page.getByRole("link", { name: "Start test now - navigation" }).click();
    }

    const priceHeading = page.locator("#price h2");
    await expect(priceHeading).toBeInViewport();
    // Below the fixed header, not under it.
    const headingTop = (await priceHeading.boundingBox())?.y ?? 0;
    expect(headingTop).toBeGreaterThanOrEqual(64);
    expect(new URL(page.url()).pathname).toBe(PAGE);
    expect(surveyRequests).toEqual([]);
  });
});

test.describe("pay to start: the fly-ins", () => {
  // Marcus, 18.10: "Can we add fly-in effects?" The landing's own reveal, so no element may
  // be left faded once the page has been scrolled past it.
  test("every fly-in plays once it is in view, top to bottom", async ({ page }) => {
    await openPage(page);
    const { height, viewport } = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));
    // A reader's pace, not a fling: stop every 60 % of a screen until what is in view has
    // played. CI's WebKit runs the observer far less often than every 40 ms, so a test
    // that scrolls past without stopping misses reveals no person would (18.10, #613).
    const unplayedInView = () =>
      page.evaluate(() => {
        // The band ScrollAnimator watches: the top 90 % of the screen.
        const bottom = window.innerHeight * 0.9;
        return [...document.querySelectorAll<HTMLElement>(".animate-on-scroll:not(.animate)")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const shown = Math.min(r.bottom, bottom) - Math.max(r.top, 0);
            return r.height > 0 && shown >= Math.min(r.height, bottom) * 0.5;
          })
          .map((el) => (el.textContent ?? "").trim().slice(0, 40));
      });
    for (let y = 0; y <= height; y += Math.round(viewport * 0.6)) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await expect.poll(unplayedInView).toEqual([]);
    }
    await expect.poll(() => page.locator(".animate-on-scroll:not(.animate)").count()).toBe(0);
  });

  test("under reduced motion, everything is there without a scroll", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPage(page);
    const faded = await page
      .locator(".animate-on-scroll, .animate-on-load")
      .evaluateAll((els) => els.filter((el) => getComputedStyle(el).opacity !== "1").length);
    expect(faded).toBe(0);
  });
});
