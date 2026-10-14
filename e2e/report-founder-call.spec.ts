import { test, expect, type Page } from "@playwright/test";

import { mockReport } from "./fixtures/report";

/**
 * The founder-call leave offer on a real build (features/report/logic/leaveIntent.ts):
 * an unpaid reader who just finished the survey in this tab is offered their full report
 * free for a 20-minute call with the founders, once, 1.6 s after the first paywall card
 * comes into view. Every device the same since 14.10.
 *
 * The offer needs the build's NEXT_PUBLIC_FOUNDER_CALL_URL, which Next inlines at build
 * time. ci.yml passes a stub calendar page to the build and the same value to this run;
 * without it the offer is off, so these cases skip.
 *
 * Submission 1 is the pay pop-up test's no_popup arm, so no plans pop-up opens on its
 * own, and none of these readers scroll as far as that test's point. The fixture's other
 * specs keep their old report date, which makes every one of them a return visit.
 */
const BOOKING = process.env.NEXT_PUBLIC_FOUNDER_CALL_URL ?? "";
const TOKEN = "test-token-leave";
const REPORT = `/report/${TOKEN}`;

test.skip(!BOOKING, "NEXT_PUBLIC_FOUNDER_CALL_URL is not set for this build");

async function openFreshReport(page: Page) {
  await page.addInitScript((token) => {
    // The survey leaves its report token in the tab that finished it.
    try {
      sessionStorage.setItem("loveiq-completed-report", token);
    } catch {
      // A browser that refuses storage cannot be a first visit; the case then fails.
    }
    // Analytics leave as beacons, which neither a route handler nor the request log sees
    // on every engine. Record them where they are sent.
    const w = window as unknown as { __analytics: string[] };
    w.__analytics = [];
    const send = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (String(url).endsWith("/api/analytics-event") && data instanceof Blob) {
        void data.text().then((text) => w.__analytics.push(text));
      }
      return send(url, data);
    };
  }, TOKEN);
  await page.route("**/api/analytics-event", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  // The cookie banner holds the offer back while it is up, as it would for a reader.
  await page.route("**/cdn-cookieyes.com/**", (route) => route.abort());
  await page
    .context()
    .route("https://calendar.app.google/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<title>Booking</title>" })
    );
  await mockReport(page, 0, { submissionId: 1, reportDate: new Date().toISOString() });
  await page.goto(REPORT);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

const offer = (page: Page) => page.getByRole("dialog", { name: /Free for a 20-Minute Call/ });

/** Brings the first paywall card into view: the offer follows 1.6 s later. */
async function reachThePaywall(page: Page) {
  const card = page.locator(".rv4-premium, .rv4-chapter.is-locked").first();
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
}

async function sentLeaveEvents(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __analytics: string[] }).__analytics
      .map((text) => JSON.parse(text) as { event_type?: string })
      .map((event) => event.event_type)
      .filter((type) => type?.startsWith("leave_offer_"))
  );
}

test.describe("founder-call leave offer", () => {
  test("waits for the paywall card, then opens and books in a new tab", async ({ page }) => {
    await openFreshReport(page);
    // At the top of the report, nothing: the reader has not reached the paywall.
    await page.waitForTimeout(3_000);
    await expect(offer(page)).toHaveCount(0);

    await reachThePaywall(page);
    await expect(offer(page)).toBeVisible({ timeout: 5_000 });

    const cta = offer(page).getByRole("link", { name: /Book a 20-Minute Call/ });
    await expect(cta).toHaveAttribute("href", BOOKING);
    await expect(cta).toHaveAttribute("target", "_blank");
    await expect(cta).toHaveAttribute("rel", /noopener/);
    const [booking] = await Promise.all([page.waitForEvent("popup"), cta.click()]);
    await expect(booking).toHaveURL(BOOKING);
    await expect(offer(page)).toHaveCount(0);

    // Persisted where the CSRF cookie can be set: WebKit refuses its Secure cookie on
    // http://localhost (see paywall-back.spec.ts), production is https.
    if (await page.evaluate(() => document.cookie.includes("csrf"))) {
      await expect
        .poll(() => sentLeaveEvents(page))
        .toEqual(["leave_offer_shown", "leave_offer_clicked"]);
    }
  });

  test("once dismissed, never again for that report, across a reload", async ({ page }) => {
    await openFreshReport(page);
    await reachThePaywall(page);
    await expect(offer(page)).toBeVisible({ timeout: 5_000 });
    await offer(page).getByRole("button", { name: "No Thanks, Keep Reading" }).click();
    await expect(offer(page)).toHaveCount(0);

    // A reload in the same tab is still the survey's tab, but the offer was made.
    await page.reload();
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    await reachThePaywall(page);
    await page.waitForTimeout(3_000);
    await expect(offer(page)).toHaveCount(0);
  });
});
