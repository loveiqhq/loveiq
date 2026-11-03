import { test, expect, type Page } from "@playwright/test";

import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { instantScroll } from "./fixtures/instant-scroll";

/**
 * Tour first, then the EUR 1.99 gate (sync 30.10; Marcus's card "Lets first do the tour > Then
 * open the pre paygate"), on a real build, through the preview's `gate=tour`: the report under
 * the guided tour with who the reader is left out (Fatih, 30.10), four stops (no lock stop),
 * then the EUR 1.99 page. Its exit page's "Maybe later" loops back to it (Marcus, 30.10).
 *
 * The preview remembers its tour for the tab only, so every case is a first open.
 */
const PREVIEW = "/report?preview=1&v4=1&gate=tour";

async function open(page: Page, baseURL: string | undefined) {
  await instantScroll(page);
  await page.route("**/api/analytics-event", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  // A reader who has answered the cookie banner: the tour waits for that answer.
  await page.route("**/cdn-cookieyes.com/**", (route) => route.abort());
  await page.context().addCookies([
    {
      name: "cookieyes-consent",
      value: "consentid:e2e,consent:yes,action:yes,necessary:yes",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.goto(PREVIEW);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

/**
 * Every event the page tracks, as PostHog is sent it (`window.__loveiqEventTap`, the hook the
 * persona walks listen on). A preview stores nothing (it has no submission), but its events
 * carry what a reader's would.
 */
async function tapEvents(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __tapped: Array<{ name: string; props: Record<string, unknown> }>;
      __loveiqEventTap: (name: string, props: Record<string, unknown>) => void;
    };
    w.__tapped = [];
    w.__loveiqEventTap = (name, props) => w.__tapped.push({ name, props });
  });
}
const tapped = (page: Page, name: string) =>
  page.evaluate(
    (n) =>
      (
        window as unknown as { __tapped: Array<{ name: string; props: Record<string, unknown> }> }
      ).__tapped
        .filter((e) => e.name === n)
        .map((e) => e.props),
    name
  );

const bubble = (page: Page) => page.locator(".rv4-tour__bubble[data-state='in']");
const button = (page: Page, name: string) =>
  bubble(page).getByRole("button", { name, exact: true });
const stepLabel = (page: Page) => bubble(page).locator(".rv4-tour__step");

/** Next through every stop, then Finish: how many stops it had. */
async function walkTour(page: Page): Promise<number> {
  let stops = 0;
  for (;;) {
    await expect(bubble(page)).toBeVisible();
    stops += 1;
    if (await button(page, "Finish").isVisible()) {
      await button(page, "Finish").click();
      return stops;
    }
    await button(page, "Next").click();
  }
}

test.describe("Tour first, then the EUR 1.99 gate", () => {
  test("tours the report with no archetype named, four stops, then the EUR 1.99 page", async ({
    page,
    baseURL,
  }) => {
    await tapEvents(page);
    await open(page, baseURL);
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("identity-veil")).toBeAttached();
    const body = (await page.locator("body").innerText()) ?? "";
    for (const name of KNOWN_ARCHETYPES) expect(body).not.toContain(name);
    await expect(page.locator(".iug-page")).toHaveCount(0);

    expect(await walkTour(page)).toBe(4);
    await expect(page.locator(".iug-page")).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // Its runs are the tour before the gate's own (AP counts them apart from free readers').
    expect((await tapped(page, "tour_started")).map((p) => p.audience)).toEqual(["gate"]);
    expect((await tapped(page, "tour_completed")).map((p) => p.audience)).toEqual(["gate"]);
  });

  // A report opened in a background tab: the tour waits for the page to be seen, and so does
  // the gate. It met the gate unseen after 12 s, stamped as seen (E07's clock, AP's "Saw the
  // €1.99 page"), and the tour never ran.
  test("waits while the page can't be seen: no gate met unseen", async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      let hidden = true;
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (hidden ? "hidden" : "visible"),
      });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      (window as unknown as { __show: () => void }).__show = () => {
        hidden = false;
        document.dispatchEvent(new Event("visibilitychange"));
      };
    });
    await open(page, baseURL);
    await page.waitForTimeout(14_000);
    await expect(page.locator(".iug-page")).toHaveCount(0);
    await expect(bubble(page)).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { __show: () => void }).__show());
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".iug-page")).toHaveCount(0);
  });

  // Mark, 01.11: "taking out the skip the tour option when we show the tour before the
  // paywall". No Skip Tour, Escape ends nothing, and Back steps back a stop.
  test("can't be skipped: no Skip Tour, Escape stays, Back steps back a stop", async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL);
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await expect(bubble(page).getByRole("button", { name: "Skip Tour" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(bubble(page)).toBeVisible();
    await expect(stepLabel(page)).toHaveText("Step 1 of 4");

    await button(page, "Next").click();
    await expect(stepLabel(page)).toHaveText("Step 2 of 4");
    await page.goBack();
    await expect(stepLabel(page)).toHaveText("Step 1 of 4");
    await expect(page.locator(".iug-page")).toHaveCount(0);
    await expect(page).toHaveURL(/\/report\?preview=1&v4=1&gate=tour$/);

    expect(await walkTour(page)).toBe(4);
    await expect(page.locator(".iug-page")).toBeVisible({ timeout: 15_000 });
    // At its own top: Safari put back the scroll the rearmed Back catch had saved at stop 2
    // (2,446px down on an iPhone) once the tour stepped off it, after the gate had opened.
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("loops: “Not ready” opens the exit page, whose “Maybe later” comes back", async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL);
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await walkTour(page);
    await expect(page.locator(".iug-page")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: "Not ready to unlock yet" }).click();
    await expect(page.locator(".pge-page")).toBeVisible();
    await page.getByRole("button", { name: "Maybe later" }).click();
    await expect(page.locator(".iug-page")).toBeVisible();
    await expect(page.locator(".pge-page")).toHaveCount(0);
    await expect(page).toHaveURL(/\/report\?preview=1&v4=1&gate=tour$/);
  });

  // A phone's usual way off the exit page, its own Back (a swipe, Android's back), was counted
  // nowhere: the router drops the page before any listener of the page hears the Back.
  test("counts the browser's Back off the exit page as a way out, once", async ({
    page,
    baseURL,
  }) => {
    await tapEvents(page);
    await open(page, baseURL);
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await walkTour(page);
    await expect(page.locator(".iug-page")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: "Not ready to unlock yet" }).click();
    await expect(page.locator(".pge-page")).toBeVisible();
    await page.goBack();
    await expect(page.locator(".iug-page")).toBeVisible();
    await expect(page.locator(".pge-page")).toHaveCount(0);
    await expect
      .poll(() => tapped(page, "paygate_exit_leave"))
      .toEqual([{ stage: "pre", via: "browser_back" }]);
  });
});
