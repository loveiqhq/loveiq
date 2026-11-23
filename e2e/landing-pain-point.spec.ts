import { test, expect, type Page } from "@playwright/test";
import { instantScroll } from "./fixtures/instant-scroll";

/**
 * Round 4's arm B (`pain_point`): Marcus's new landing page (Claude Design "LoveIQ landing
 * page · pain-point version", boards "Desktop · Hero 3" and "Mobile · Hero 3";
 * features/landing/ui/painpoint/). Opened with `?variant=`: in a production build a bare
 * "/" is a coin flip between the two arms (playwright.config.ts).
 *
 * Playback is stubbed as in landing-hero-video.spec.ts: what can break here is the wiring
 * (which element plays, with sound or not), not the codec.
 */
async function stubPlayback(page: Page) {
  await page.addInitScript(() => {
    const played: string[] = [];
    (window as unknown as { __played: string[] }).__played = played;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      played.push(`${this.getAttribute("data-testid") ?? "?"}:${this.muted ? "muted" : "sound"}`);
      setTimeout(() => {
        this.dispatchEvent(new Event("play"));
        this.dispatchEvent(new Event("playing"));
      }, 0);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
}

async function openPage(page: Page) {
  await page.goto("/?variant=pain_point");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

test.describe("Landing arm B (round 4) — the pain-point page", () => {
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
    await stubPlayback(page);
    await instantScroll(page);
  });

  test("is one page: one headline, every section, and its footer after <main>", async ({
    page,
  }) => {
    await openPage(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Become a better and more intelligent lover."
    );
    for (const section of [
      "trust_band",
      "how_it_works",
      "pain_points",
      "promise",
      "words",
      "stats",
      "archetypes",
      "testimonials",
      "foundation",
      "faq",
      "closing_cta",
      "footer",
    ]) {
      await expect(page.locator(`[data-landing-section="${section}"]`), section).toHaveCount(1);
    }
    await expect(page.locator("main footer")).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("starts the survey from the hero's button, the link the persona walkers press", async ({
    page,
  }) => {
    await openPage(page);
    await page
      .getByRole("link", { name: /- hero$/ })
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForURL(/\/survey/);
  });

  test("question 1 in the hero: a pick becomes question 1's answer, and the button continues", async ({
    page,
  }) => {
    await openPage(page);
    const six = page.getByRole("radio", { name: "6", exact: true });
    await six.click();
    await expect(six).toHaveAttribute("aria-checked", "true");
    const draft = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("loveiq-survey-answers") ?? "{}")
    );
    expect(draft.answers?.["01002"]).toBe(6);
    expect(draft.prefilled).toContain("01002");
    await page.getByRole("link", { name: "Continue free test - hero" }).click();
    await page.waitForURL(/\/survey/);
  });

  test("plays the film in its card on a tap, with sound, and fetches no video before", async ({
    page,
  }) => {
    const videoRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/videos/")) videoRequests.push(r.url());
    });
    await openPage(page);
    await page.locator('[data-testid="hero-video"][data-ready]').waitFor();
    expect(videoRequests).toHaveLength(0);
    await page.getByTestId("hero-video-play").click();
    await expect(page.getByTestId("hero-video-full")).toHaveAttribute("controls", "");
    const played = await page.evaluate(
      () => (window as unknown as { __played: string[] }).__played
    );
    expect(played).toEqual(["hero-video-full:sound"]);
  });

  test("FAQ: the first answer is open, and opening another closes it", async ({ page }) => {
    await openPage(page);
    const questions = page.locator("button[aria-controls^='w-faq-panel-']");
    await expect(questions.first()).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#w-faq-panel-0")).toBeVisible();
    await questions.nth(1).click();
    await expect(questions.nth(1)).toHaveAttribute("aria-expanded", "true");
    await expect(questions.first()).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#w-faq-panel-1")).toBeVisible();
    await expect(page.locator("#w-faq-panel-0")).toBeHidden();
  });

  test("ships no client reference as a class name", async ({ page }) => {
    // A server component that imports a value from a "use client" module gets a client
    // reference, rendered as a function's source (PP_FOCUS on five links, final review 15.11).
    await openPage(page);
    await expect(page.locator('[class*="Attempted to call"]')).toHaveCount(0);
    expect(await page.content()).not.toContain("is on the client");
  });

  test("its footer links the seven legal pages", async ({ page }) => {
    await openPage(page);
    const footer = page.getByRole("contentinfo");
    for (const [name, href] of [
      ["Privacy", "/privacy-policy"],
      ["Cookies", "/cookies"],
      ["Imprint", "/imprint"],
      ["Terms & Conditions", "/terms-and-conditions"],
      ["Terms of Use", "/terms-of-use"],
      ["Digital content terms", "/digital-content-terms"],
      ["Medical disclaimer", "/medical-disclaimer"],
    ] as const) {
      await expect(footer.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
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

  test("every fly-in plays once it is in view, top to bottom", async ({ page }) => {
    await openPage(page);
    const { height, viewport } = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));
    // A reader's pace, not a fling: stop every 60 % of a screen until what is in view has
    // played. CI's WebKit runs the observer far less often than every 40 ms (#613).
    const unplayedInView = () =>
      page.evaluate(() => {
        // The band ScrollAnimator watches: the top 90 % of the screen.
        const bottom = window.innerHeight * 0.9;
        return [
          ...document.querySelectorAll<HTMLElement>(
            ".animate-on-scroll:not(.animate), [data-reveal]:not(.animate)"
          ),
        ]
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
    await expect
      .poll(() =>
        page.locator(".animate-on-scroll:not(.animate), [data-reveal]:not(.animate)").count()
      )
      .toBe(0);
    // v2 (Hana's board): every entrance then lands, the last cross-out about 3s after its row.
    await expect
      .poll(
        () =>
          page
            .locator(".pp-card-in, .pp-pop, .pp-w, .pp-rail-icon")
            .evaluateAll((els) => els.filter((el) => getComputedStyle(el).opacity !== "1").length),
        { timeout: 10_000 }
      )
      .toBe(0);
  });

  test("under reduced motion, everything is there without a scroll", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPage(page);
    // At rest in place, not only visible: a start rule that outranks the fallback would leave
    // an element faded in but 40px low.
    const unsettled = await page
      .locator(".pp-root .animate-on-scroll, .pp-card-in, .pp-pop, .pp-w, .pp-wipe, .pp-rail-icon")
      .evaluateAll(
        (els) =>
          els.filter((el) => {
            const style = getComputedStyle(el);
            return style.opacity !== "1" || style.transform !== "none";
          }).length
      );
    expect(unsettled).toBe(0);
    // The numbers stand at their values, with no count.
    await expect(page.locator("[data-count-up]")).toHaveText(["47%", "56%", "42%", "77%"]);
  });

  test("rolls the four numbers up to their values once they are in view", async ({ page }) => {
    await openPage(page);
    const numbers = page.locator("[data-count-up]");
    await numbers.first().scrollIntoViewIfNeeded();
    // Each number scrolls in on a phone, where the cards stack; then each lands exactly.
    for (let i = 0; i < 4; i += 1) await numbers.nth(i).scrollIntoViewIfNeeded();
    await expect(numbers).toHaveText(["47%", "56%", "42%", "77%"], { timeout: 10_000 });
  });

  test("steps the six patterns on with the next button on a desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPage(page);
    const row = page.getByRole("list", { name: "Six patterns" });
    await row.scrollIntoViewIfNeeded();
    const previous = page.getByRole("button", { name: "Previous pattern" });
    await expect(previous).toBeDisabled();
    await page.getByRole("button", { name: "Next pattern" }).click();
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expect(previous).toBeEnabled();
  });
});
