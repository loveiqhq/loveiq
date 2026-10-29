import { expect, test, type Page } from "@playwright/test";

import { buildInitialGateFixture, buildPricingQuote, mockReport } from "./fixtures/report";

/**
 * Marcus's "Paygate exit pages" (28.10), end to end against mocked APIs. The EUR 1.99 gate's
 * "Not ready to unlock yet" opens its exit page (`?leave=pre`); a EUR 1.99 holder's plan picker
 * opens the full report's (`?leave=full`). Both live on the report's own URL, on a history
 * entry of their own, so the phone's Back closes them, and neither asks for the report again.
 */
const GATE_TOKEN = "rpt_e2eExitGateAbCdEfGhIj";
const HOLDER_TOKEN = "rpt_e2eExitFullAbCdEfGhIj";

type Stored = { event_type?: string; metadata?: Record<string, unknown> };

/** What the pages store, read where it is sent: the request log misses beacons on WebKit. */
async function recordAnalytics(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __analytics: string[] };
    w.__analytics = [];
    const send = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (String(url).endsWith("/api/analytics-event") && data instanceof Blob) {
        void data.text().then((text) => w.__analytics.push(text));
      }
      return send(url, data);
    };
  });
  await page.route("**/api/analytics-event", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
}

const stored = (page: Page, eventType: string) =>
  page.evaluate(
    (type) =>
      (window as unknown as { __analytics: string[] }).__analytics
        .map((text) => JSON.parse(text) as Stored)
        .filter((event) => event.event_type === type)
        .map((event) => event.metadata ?? {}),
    eventType
  );

/**
 * Whether this page can store events at all. It needs its CSRF cookie, `__Host-csrf`, which
 * must be Secure, and WebKit refuses a Secure cookie on http://localhost: there the page sends
 * nothing to record (production is https). As paywall-back.spec.ts does, the behaviour is
 * asserted everywhere and the stored events where they can be sent, Chromium and Firefox.
 */
const persists = (page: Page) => page.evaluate(() => document.cookie.includes("csrf"));

/** Every ask for the report, the gate's included. */
function countReportAsks(page: Page) {
  let asks = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/report") asks += 1;
  });
  return () => asks;
}

async function mockGate(page: Page) {
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildInitialGateFixture(GATE_TOKEN)),
    });
  });
}

/** A EUR 1.99 holder's report: the full report at EUR 19.99, the EUR 10 already off. */
async function mockHolder(page: Page, source: "paid" | "gift" = "paid") {
  const full = buildPricingQuote("full_report", 0);
  await mockReport(page, 0, {
    initialUnlock: true,
    initialUnlockSource: source,
    pricingQuotes: {
      full_report: {
        ...full,
        currentPriceCents: 1999,
        chargedPriceCents: 1999,
        upgradeCreditCents: 1000,
        creditKind: "initial",
      },
      all_reports: buildPricingQuote("all_reports", 0),
    },
  });
}

const lockedChapter = (page: Page) =>
  page.locator(".rv4-chapter.is-locked .rv4-chapter__button").first();

async function openPlans(page: Page) {
  await page.goto(`/report/${HOLDER_TOKEN}`);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  const head = lockedChapter(page);
  await head.scrollIntoViewIfNeeded();
  await head.click();
  await expect(page.locator(".report-pricing-modal")).toHaveAttribute("data-state", "open");
  return head;
}

test.describe("The EUR 1.99 gate's exit page", () => {
  test("opens in place on “Not ready to unlock yet”, asks why, and Back finds the gate", async ({
    page,
  }) => {
    await recordAnalytics(page);
    const asks = countReportAsks(page);
    await mockGate(page);
    await page.goto(`/report/${GATE_TOKEN}`);
    await expect(page.locator(".iug-page")).toBeVisible();

    await page.getByRole("link", { name: "Not ready to unlock yet" }).click();
    await expect(page).toHaveURL(new RegExp(`/report/${GATE_TOKEN}\\?leave=pre$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Unlocking is\sfully risk-free/
    );
    await expect(page.locator(".iug-page")).toBeHidden();
    await expect(page.getByRole("radio")).toHaveCount(8);

    const first = page.getByRole("radio").first();
    await first.click();
    await expect(first).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Thank you. We read every answer.")).toBeVisible();

    // (The arms the page stamps on every stored event ride along: hence objectContaining.)
    if (await persists(page)) {
      await expect
        .poll(() => stored(page, "initial_gate_back"))
        .toEqual([expect.objectContaining({ to: "exit_page" })]);
      await expect
        .poll(() => stored(page, "paygate_exit_viewed"))
        .toEqual([expect.objectContaining({ stage: "pre" })]);
      await expect
        .poll(() => stored(page, "paygate_exit_reason"))
        .toEqual([expect.objectContaining({ stage: "pre", position: 1, changed: false })]);
    }

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/report/${GATE_TOKEN}$`));
    await expect(page.locator(".iug-page")).toBeVisible();
    await expect(page.locator(".pge-page")).toHaveCount(0);
    expect(asks()).toBe(1);
  });

  test("“Maybe later” leads to the landing page", async ({ page }) => {
    await recordAnalytics(page);
    await mockGate(page);
    await page.goto(`/report/${GATE_TOKEN}?leave=pre`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const canStore = await persists(page);
    await page.getByRole("link", { name: "Maybe later" }).click();
    await expect(page).toHaveURL(/\/$/);
    if (canStore) {
      await expect
        .poll(() => stored(page, "paygate_exit_leave"))
        .toEqual([expect.objectContaining({ stage: "pre", via: "maybe_later" })]);
    }
  });
});

test.describe("The full report's exit page, for a EUR 1.99 holder", () => {
  test("opens from the plans' “Not ready to unlock yet” and goes back to the open chapters", async ({
    page,
  }) => {
    await recordAnalytics(page);
    const asks = countReportAsks(page);
    await mockHolder(page);
    const head = await openPlans(page);
    const picker = page.locator(".report-pricing-modal");
    await expect(picker.getByRole("button", { name: "Close pricing modal" })).toHaveCount(0);
    await picker.getByRole("button", { name: "Not ready to unlock yet" }).click();

    const layer = page.getByRole("dialog", { name: "Your Full Report" });
    await expect(layer).toBeVisible();
    await expect(page).toHaveURL(/\?leave=full$/);
    await expect(picker).toHaveAttribute("data-state", "closed");
    await expect(layer.getByText("You earned it with your €1.99 unlock.")).toBeVisible();
    await expect(layer.locator(".pge-offer__amount")).toHaveText("€19.99");
    if (await persists(page)) {
      await expect
        .poll(() => stored(page, "paywall_dismissed"))
        .toEqual([expect.objectContaining({ source: "not_ready" })]);
    }

    await layer.getByRole("button", { name: "Back to my open chapters" }).click();
    await expect(layer).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/report/${HOLDER_TOKEN}$`));
    // Where the reader left the report: the chapter that opened the plans.
    await expect(head).toBeInViewport();
    expect(asks()).toBe(1);
  });

  test("closes on the phone's Back, and the plans stay closed", async ({ page }) => {
    await mockHolder(page);
    await openPlans(page);
    await page
      .locator(".report-pricing-modal")
      .getByRole("button", { name: "Not ready to unlock yet" })
      .click();
    await expect(page.getByRole("dialog", { name: "Your Full Report" })).toBeVisible();
    await page.goBack();
    await expect(page.locator(".pge-layer")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/report/${HOLDER_TOKEN}$`));
    await expect(page.locator(".report-pricing-modal")).toHaveAttribute("data-state", "closed");
  });

  test("words E07's gift as the reader's, not as earned", async ({ page }) => {
    await mockHolder(page, "gift");
    await page.goto(`/report/${HOLDER_TOKEN}?leave=full`);
    const layer = page.getByRole("dialog", { name: "Your Full Report" });
    await expect(layer.getByText("It’s yours toward your Full Report.")).toBeVisible();
    await expect(layer.getByText("You earned it", { exact: false })).toHaveCount(0);
  });

  test("ignores ?leave=full for a reader with no EUR 1.99, and drops it", async ({ page }) => {
    await mockReport(page, 0);
    await page.goto(`/report/${HOLDER_TOKEN}?leave=full`);
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    await expect(page).toHaveURL(new RegExp(`/report/${HOLDER_TOKEN}$`));
    await expect(page.locator(".pge-layer")).toHaveCount(0);
  });
});
