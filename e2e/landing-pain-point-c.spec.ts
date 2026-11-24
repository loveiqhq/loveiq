import { test, expect, type Page } from "@playwright/test";
import { instantScroll } from "./fixtures/instant-scroll";

/**
 * Round 4's version C (`pain_point_c`, LoveIQ Sync 24 Nov 2026): the pain-point page with
 * Q10003, "I'm comfortable expressing what turns me on.", under the film, where B
 * (`pain_point`, landing-pain-point.spec.ts) asks Q01002 beside it. Opened with `?variant=`:
 * in a production build a bare "/" is a coin flip between the two live arms
 * (playwright.config.ts).
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

test.describe("Landing version C (round 4) — the question under the film", () => {
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
    test(`puts the question under the film on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openPage(page);
      const film = await box(page, '[data-testid="pp-hero"] [data-testid="hero-video"]');
      const question = await box(page, '[data-testid="pp-hero"] [role="radiogroup"]');
      // Below the film's foot, inside its column.
      expect(question.y).toBeGreaterThanOrEqual(film.y + film.height);
      expect(question.x).toBeGreaterThanOrEqual(film.x - 1);
      expect(question.x + question.width).toBeLessThanOrEqual(film.x + film.width + 1);
      const headline = await box(page, '[data-testid="pp-hero"] h1');
      if (width >= 1024) {
        // Desktop: the film and its question are the right column, the headline the left.
        expect(headline.x + headline.width).toBeLessThanOrEqual(film.x);
      } else {
        // Phone: the headline, then the film, then the question, then the live line.
        expect(film.y).toBeGreaterThanOrEqual(headline.y + headline.height);
        const live = await box(page, '[data-testid="pp-hero"] .pp-live');
        expect(live.y).toBeGreaterThanOrEqual(question.y + question.height);
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
