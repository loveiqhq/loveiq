import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Mark's redesigned EUR 1.99 page (Claude Design HcHeTUFfEgmg62qqktHSMU, 12 Nov 2026): the
 * gate opening on the reader's Core Archetype, its match ring and five aspect cards, two open
 * and three locked. Behind `report_gate_archetype_reveal` in production; the preview's
 * `&reveal=1` draws it from the repository's own copy (app/api/report/preview/route.ts).
 */
const URL = "/report?preview=1&v4=1&gate=1&reveal=1&archetype=spark-seeker";

test.describe("The EUR 1.99 page with the archetype on it", () => {
  test("opens on the archetype, its match and its line, then the cards", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByRole("heading", { level: 1, name: "Spark Seeker" })).toBeVisible();
    await expect(page.getByRole("img", { name: /% match with Spark Seeker/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Sexual Archetypes/ })).toHaveCount(0);

    const carousel = page.getByRole("region", { name: "Your Core Archetype, aspect by aspect" });
    await expect(carousel.locator("[data-gate-aspect]")).toHaveCount(5);
    await expect(carousel.locator("[data-locked]")).toHaveCount(3);
    await expect(carousel.getByText("Pleasure & Play")).toBeVisible();

    // The page itself never scrolls sideways; only the carousel does.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("moves one card per step with its arrow", async ({ page }) => {
    await page.goto(URL);
    const track = page.locator("[data-gate-carousel]");
    await expect(track).toBeVisible();
    await page.getByRole("button", { name: "Next card" }).click();
    await expect
      .poll(() => track.evaluate((el) => Math.round(el.scrollLeft)), { timeout: 3000 })
      .toBeGreaterThanOrEqual(300);
    await expect(page.getByRole("button", { name: "Card 2" })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  test("a locked card's lock brings the plan into view, its button focused", async ({ page }) => {
    await page.goto(URL);
    const lock = page.getByRole("button", { name: "Locked, opens with your Light Report" }).first();
    await lock.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
    await lock.click();
    const cta = page.locator(".iug-card").getByRole("button", { name: /^unlock now/i });
    await expect(cta).toBeFocused();
    await expect(cta).toBeInViewport();
  });

  test("keeps today's promises on the card", async ({ page }) => {
    await page.goto(URL);
    const card = page.locator(".iug-card");
    await expect(card).toContainText("Your Personal Light Report");
    await expect(card).toContainText("14-day money-back guarantee.");
    await expect(card).toContainText("3x full chapters + 4x partly open");
  });

  test("passes axe on the new top", async ({ page }) => {
    await page.goto(URL);
    const top = page.locator("[data-gate-reveal]");
    await expect(top).toBeVisible();
    // Its heading and line rise in from opacity 0 (gate-reveal.css, iugr-rise). Playwright
    // calls them visible from the first frame, so axe could measure the contrast of text still
    // fading in: "color-contrast: h1" on one run, ".iugr-blurb" on its retry (#725, Mobile
    // Chrome). Scan what the reader ends up seeing: once every finite animation has run.
    await top.evaluate((root) =>
      Promise.all(
        root
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished)
      )
    );
    const results = await new AxeBuilder({ page }).include("[data-gate-reveal]").analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    ).toEqual([]);
  });
});
