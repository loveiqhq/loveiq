// TEMPORARY: the survey steps flag tablets (staging-backed local server). Not committed.
import { test, expect, type Page } from "@playwright/test";
import { appendFileSync } from "node:fs";

import { SURVEY_SESSION_KEY } from "../features/survey/ui/hooks/surveySession";

const OUT = process.env.E2E_OUT ?? "/dev/null";

async function firstAnswer(page: Page, label: string) {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort()
  );
  await page.goto("/survey");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page.getByRole("button", { name: /continue/i }).first().click();
  await page.getByRole("button", { name: /skip intro/i }).click();
  await page.getByRole("checkbox").first().click();
  await page.getByRole("checkbox").nth(1).locator("div").first().click();
  await page.getByRole("button", { name: /i agree/i }).click();
  await expect(page.getByRole("heading", { name: "What is your name?" })).toBeVisible();
  await page.getByRole("textbox").first().fill("Tablet");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(2500);
  const session = await page.evaluate((k) => sessionStorage.getItem(k), SURVEY_SESSION_KEY);
  await page.goto("about:blank"); // the steps flush on leaving
  await page.waitForTimeout(3000);
  appendFileSync(OUT, `${label} ${session ?? "?"}\n`);
}

test.describe("an iPad that says so", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
  });
  test("is a tablet", async ({ page }) => {
    test.setTimeout(120_000);
    await firstAnswer(page, "ipad-ua");
  });
});

test.describe("an iPad that passes for a Mac", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    viewport: { width: 1024, height: 1366 },
    hasTouch: true,
  });
  test("is a tablet by its touch screen", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 })
    );
    await firstAnswer(page, "mac-touch");
  });
});

test.describe("a Mac", () => {
  test("is not a tablet", async ({ page }) => {
    test.setTimeout(120_000);
    await firstAnswer(page, "desktop");
  });
});

test("session key exists", () => expect(SURVEY_SESSION_KEY).toBeTruthy());
