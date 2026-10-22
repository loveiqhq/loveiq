import { test, expect, type Page } from "@playwright/test";

import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import { PRIMARY_ARCHETYPE, guidedTourKey, mockReport } from "./fixtures/report";
import { instantScroll } from "./fixtures/instant-scroll";

/**
 * The guided tour on a real build (features/report/logic/guidedTour.ts; Figma 1713:1071 ›
 * 1755:1275, Ready for Dev 16.10): on each V4 report's first open in a browser it walks the
 * reader through the chapter menu, "Show All", a chapter's toggle, "Try This" and, for a
 * reader who has not paid, a locked chapter's lock. The report is held still under it, and
 * it ends at the top of the page.
 *
 * Every case is a fresh browser, so a first open. The report carries Typical Beliefs' V4
 * copy, where four of the five stops are. Submission 1 is the pay pop-up test's no_popup
 * arm, so the plans pop-up does not open on its own.
 */
const TOKEN = "test-token-tour";
const REPORT = `/report/${TOKEN}`;

const TITLES = [
  "Easily Navigate Your Report",
  "Read the Full Text",
  "Show or Hide Chapters",
  "Put Your Insights Into Practice",
  "Discover the Full Report",
];

async function openReport(
  page: Page,
  baseURL: string | undefined,
  { plan = null, seen = false }: { plan?: string | null; seen?: boolean } = {}
) {
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
  await mockReport(
    page,
    0,
    {
      submissionId: 1,
      accessPlan: plan,
      typicalBeliefs: buildTypicalBeliefs(PRIMARY_ARCHETYPE, { locked: plan === null }),
    },
    { tour: !seen }
  );
  await page.goto(REPORT);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

const bubble = (page: Page) => page.locator(".rv4-tour__bubble[data-state='in']");
const title = (page: Page) => bubble(page).locator(".rv4-tour__title");
const step = (page: Page) => bubble(page).locator(".rv4-tour__step");
const button = (page: Page, name: string) =>
  bubble(page).getByRole("button", { name, exact: true });

/** Next through every stop, then Finish: the titles in the order they came. */
async function walk(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    await expect(bubble(page)).toBeVisible();
    seen.push((await title(page).textContent()) ?? "");
    if (await button(page, "Finish").isVisible()) {
      await button(page, "Finish").click();
      break;
    }
    await button(page, "Next").click();
    await expect(title(page)).not.toHaveText(seen.at(-1)!);
  }
  return seen;
}

test.describe("guided tour on the first open", () => {
  test("walks a free reader through five stops and lets go of the page at the top", async ({
    page,
    baseURL,
  }) => {
    await openReport(page, baseURL);
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await expect(step(page)).toHaveText(/step 1 of 5/i);
    await expect(page.getByRole("dialog", { name: TITLES[0] })).toBeVisible();
    // No Back on the first stop; no Skip on the last.
    await expect(button(page, "Back")).toHaveCount(0);

    expect(await walk(page)).toEqual(TITLES);

    await expect(page.locator(".rv4-tour")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), guidedTourKey(1))
    ).not.toBeNull();
    // Released: the page answers the reader again.
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(0);

    // Once per report.
    await page.reload();
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    await page.waitForTimeout(5_000);
    await expect(page.locator(".rv4-tour")).toHaveCount(0);

    // The reader's next report starts it again (Marcus, 20.10).
    await page.unroute("**/api/report?**");
    await mockReport(
      page,
      0,
      { submissionId: 2, typicalBeliefs: buildTypicalBeliefs(PRIMARY_ARCHETYPE, { locked: true }) },
      { tour: true }
    );
    await page.reload();
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
  });

  test("gives a reader who has paid four stops, ending on Try This", async ({ page, baseURL }) => {
    await openReport(page, baseURL, { plan: "full_report" });
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await expect(step(page)).toHaveText(/step 1 of 4/i);
    expect(await walk(page)).toEqual(TITLES.slice(0, 4));
  });

  test("ends on Escape and does not come back", async ({ page, baseURL }) => {
    await openReport(page, baseURL);
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await button(page, "Next").click();
    await expect(step(page)).toHaveText(/step 2 of 5/i);
    await page.keyboard.press("Escape");
    await expect(page.locator(".rv4-tour")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
    await page.reload();
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    await page.waitForTimeout(5_000);
    await expect(page.locator(".rv4-tour")).toHaveCount(0);
  });

  test("does not start for a browser that has seen it, which can replay it from the menu", async ({
    page,
    baseURL,
  }) => {
    await openReport(page, baseURL, { seen: true });
    await page.waitForTimeout(5_000);
    await expect(page.locator(".rv4-tour")).toHaveCount(0);

    // The desktop's sidebar from 1280px, the phone's drawer below.
    const sidebarReplay = page.locator(".report-sidebar .report-tour-replay");
    if (await sidebarReplay.isVisible()) {
      await sidebarReplay.click();
    } else {
      await page.getByRole("button", { name: /^Chapter:/ }).click();
      await page.getByRole("button", { name: "Replay the Tour" }).click();
    }
    await expect(bubble(page)).toBeVisible({ timeout: 10_000 });
    await expect(step(page)).toHaveText(/step 1 of 5/i);
  });

  test("still walks under reduced motion, by jumps", async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openReport(page, baseURL);
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".rv4-tour__edge[data-pulse]")).toHaveCount(0);
    expect(await walk(page)).toEqual(TITLES);
    await expect(page.locator(".rv4-tour")).toHaveCount(0);
  });
});
