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

const bubble = (page: Page) => page.locator(".rv4-tour__bubble[data-state='in']");
const button = (page: Page, name: string) =>
  bubble(page).getByRole("button", { name, exact: true });

test.describe("Tour first, then the EUR 1.99 gate", () => {
  test("tours the report with no archetype named, four stops, then the EUR 1.99 page", async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL);
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("identity-veil")).toBeAttached();
    const body = (await page.locator("body").innerText()) ?? "";
    for (const name of KNOWN_ARCHETYPES) expect(body).not.toContain(name);
    await expect(page.locator(".iug-page")).toHaveCount(0);

    let stops = 0;
    for (;;) {
      await expect(bubble(page)).toBeVisible();
      stops += 1;
      if (await button(page, "Finish").isVisible()) {
        await button(page, "Finish").click();
        break;
      }
      await button(page, "Next").click();
    }
    expect(stops).toBe(4);
    await expect(page.locator(".iug-page")).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("meets the EUR 1.99 page when the reader leaves the tour early", async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL);
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Escape");
    await expect(page.locator(".iug-page")).toBeVisible({ timeout: 15_000 });
  });

  test("loops: “Not ready” opens the exit page, whose “Maybe later” comes back", async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL);
    await expect(bubble(page)).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Escape");
    await expect(page.locator(".iug-page")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: "Not ready to unlock yet" }).click();
    await expect(page.locator(".pge-page")).toBeVisible();
    await page.getByRole("button", { name: "Maybe later" }).click();
    await expect(page.locator(".iug-page")).toBeVisible();
    await expect(page.locator(".pge-page")).toHaveCount(0);
    await expect(page).toHaveURL(/\/report\?preview=1&v4=1&gate=tour$/);
  });
});
