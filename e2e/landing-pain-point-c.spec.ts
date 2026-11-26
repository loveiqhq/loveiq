import { test, expect, type Page } from "@playwright/test";
import { instantScroll } from "./fixtures/instant-scroll";

/**
 * Round 4's version C (`pain_point_c`, LoveIQ Sync 24 Nov 2026): the pain-point page asking
 * Q10003, "I'm comfortable expressing what turns me on.", where B (`pain_point`,
 * landing-pain-point.spec.ts) asks Q01002, with the privacy line moved under the film.
 * Opened with `?variant=`: in a production build a bare "/" is a coin flip between the two
 * live arms (playwright.config.ts).
 */
const C_QUESTION = "I'm comfortable expressing what turns me on.";

async function openPage(page: Page) {
  await page.goto("/?variant=pain_point_c");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

/** The page box of the first visible element a locator finds. */
async function box(page: Page, selector: string) {
  const b = await page.locator(selector).filter({ visible: true }).first().boundingBox();
  if (!b) throw new Error(`${selector} has no box`);
  return b;
}

test.describe("Landing version C (round 4) — Q10003, the privacy line under the film", () => {
  test.beforeEach(async ({ page }) => {
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
    await instantScroll(page);
  });

  test("asks Q10003, not B's question", async ({ page }) => {
    await openPage(page);
    await expect(page.getByRole("radiogroup", { name: C_QUESTION })).toBeVisible();
    await expect(
      page.getByRole("radiogroup", { name: "Right now, I feel satisfied with my sex life." })
    ).toHaveCount(0);
  });

  for (const [name, width] of [
    ["a phone", 390],
    ["a desktop", 1440],
  ] as const) {
    test(`asks the question where B does, the privacy line under the film, on ${name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openPage(page);
      const headline = await box(page, '[data-testid="pp-hero"] h1');
      const question = await box(page, '[data-testid="pp-hero"] [role="radiogroup"]');
      const live = await box(page, '[data-testid="pp-hero"] .pp-live');
      const film = await box(page, '[data-testid="pp-hero"] [data-testid="hero-video"]');
      const privacy = await box(page, '[data-testid="pp-hero"] p:has(a[href="/trust-zone"])');
      // As on B: the question under the headline, the live line under the question.
      expect(question.y).toBeGreaterThanOrEqual(headline.y + headline.height);
      expect(live.y).toBeGreaterThanOrEqual(question.y + question.height);
      // The privacy line below the film's foot, inside its column.
      expect(privacy.y).toBeGreaterThanOrEqual(film.y + film.height);
      expect(privacy.x).toBeGreaterThanOrEqual(film.x - 1);
      expect(privacy.x + privacy.width).toBeLessThanOrEqual(film.x + film.width + 1);
      if (width >= 1024) {
        // Desktop: the headline and the question are the left column, the film the right.
        expect(headline.x + headline.width).toBeLessThanOrEqual(film.x);
        expect(question.x + question.width).toBeLessThanOrEqual(film.x);
      } else {
        // Phone: the film after the live line, then the privacy line.
        expect(film.y).toBeGreaterThanOrEqual(live.y + live.height);
      }
    });
  }

  test("a pick becomes Q10003's answer, prefilled, and the button continues to the survey", async ({
    page,
  }) => {
    await openPage(page);
    const six = page
      .getByRole("radiogroup", { name: C_QUESTION })
      .getByRole("radio", { name: "6", exact: true });
    await six.click();
    await expect(six).toHaveAttribute("aria-checked", "true");
    const draft = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("loveiq-survey-answers") ?? "{}")
    );
    expect(draft.answers).toEqual({ "10003": 6 });
    expect(draft.prefilled).toEqual(["10003"]);
    await page.getByRole("link", { name: "Continue free test - hero" }).click();
    await page.waitForURL(/\/survey/);
  });

  test("never scrolls sideways, from a small phone to a wide screen", async ({ page }) => {
    await openPage(page);
    for (const width of [320, 360, 390, 414, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(over, `${width}px`).toBeLessThanOrEqual(0);
    }
  });
});
