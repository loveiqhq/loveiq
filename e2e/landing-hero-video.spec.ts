import { test, expect, type Page } from "@playwright/test";
import { instantScroll } from "./fixtures/instant-scroll";

/**
 * Arm B of the landing test (round 3, Figma Report-3.0 `1503:12473`): the presenter
 * video in the hero instead of question 1.
 *
 * Playback is stubbed. Playwright's bundled browsers do not play H.264/AAC on every CI
 * runner, and what can break here is the wiring — which element plays, with sound or
 * not, what replaces the button — not the codec. Each play() resolves and, like a real
 * browser, reports `play` and `playing` a moment later.
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

/** The video component hydrates from its own chunk, after the page's; tap only once it has. */
async function openArmB(page: Page) {
  await page.goto("/?variant=white_video");
  await page.locator('[data-testid="hero-video"][data-ready]').waitFor();
}

test.describe("Landing arm B — the hero video", () => {
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

  test("shows the video instead of question 1, and fetches nothing big before a tap", async ({
    page,
  }) => {
    const fullVideoRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("emma-intro")) fullVideoRequests.push(r.url());
    });
    await page.goto("/?variant=white_video");
    await expect(page.getByTestId("hero-video")).toBeVisible();
    await expect(page.getByTestId("hero-video-play")).toBeVisible();
    // Only the closing card is left on the page; the hero has none.
    await expect(page.getByRole("button", { name: /^4 of 7/ })).toHaveCount(1);
    expect(fullVideoRequests).toHaveLength(0);
  });

  test("plays the full video with sound on a tap and hands over its controls", async ({ page }) => {
    await openArmB(page);
    await page.getByTestId("hero-video-play").click();
    await expect(page.getByTestId("hero-video-full")).toHaveAttribute("controls", "");
    await expect(page.getByTestId("hero-video-play")).toHaveCount(0);
    const played = await page.evaluate(
      () => (window as unknown as { __played: string[] }).__played
    );
    expect(played).toContain("hero-video-full:sound");
  });

  test("keeps the hero's own call to action", async ({ page }) => {
    await page.goto("/?variant=white_video");
    await page.getByRole("link", { name: "Start my free test - hero" }).click();
    await page.waitForURL(/\/survey/);
  });

  test("sits where Figma puts it", async ({ page }) => {
    await page.goto("/?variant=white_video");
    const box = await page.getByTestId("hero-video").boundingBox();
    expect(box).not.toBeNull();
    const vw = page.viewportSize()!.width;
    // Figma: 472 wide on desktop; 316.75 at 390, i.e. 90.5% of the content column.
    const width = vw >= 1024 ? 472 : Math.min(472, 0.905 * (vw - 40));
    expect(Math.abs(box!.width - width)).toBeLessThanOrEqual(2);
    expect(Math.abs(box!.height - width / (472 / 269.896))).toBeLessThanOrEqual(2);
    // Desktop: its top 194px from the top of the page, as drawn.
    if (vw >= 1024) expect(Math.abs(box!.y - 194)).toBeLessThanOrEqual(2);
  });
});
