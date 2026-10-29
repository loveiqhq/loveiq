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

  test("shows the video instead of question 1, and fetches no video before a tap", async ({
    page,
  }) => {
    const videoRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/videos/")) videoRequests.push(r.url());
    });
    await openArmB(page);
    await expect(page.getByTestId("hero-video")).toBeVisible();
    await expect(page.getByTestId("hero-video-play")).toBeVisible();
    // Only the closing card is left on the page; the hero has none.
    await expect(page.getByRole("button", { name: /^4 of 7/ })).toHaveCount(1);
    expect(videoRequests).toHaveLength(0);
  });

  /**
   * 29.10 sync: no autoplay (Marcus), "a bigger play button in the middle, hover". The
   * button sits below the middle so it covers Emma's chest, not her face.
   */
  test("waits paused on the poster, the play button low in the middle and the running time in the corner", async ({
    page,
  }) => {
    // The slot rises 24px into place on load; under reduced motion it starts there.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openArmB(page);
    // Nothing rolls on its own: nothing has played, and no video has a source.
    expect(
      await page.evaluate(() => (window as unknown as { __played: string[] }).__played)
    ).toEqual([]);
    await expect(page.locator('[data-testid="hero-video"] video[src]')).toHaveCount(0);

    const box = (await page.getByTestId("hero-video").boundingBox())!;
    const circle = (await page.getByTestId("hero-video-play-icon").boundingBox())!;
    const size = page.viewportSize()!.width >= 640 ? 72 : 52;
    expect(Math.abs(circle.width - size)).toBeLessThanOrEqual(1);
    expect(Math.abs(circle.height - size)).toBeLessThanOrEqual(1);
    // Centred left to right; its middle at 70% of the box's height.
    expect(Math.abs(circle.x + circle.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(circle.y + circle.height / 2 - (box.y + 0.7 * box.height))).toBeLessThanOrEqual(
      1
    );
    // The running time: bottom right, inside the box, clear of the circle.
    const time = (await page.getByTestId("hero-video-play").getByText("1:10").boundingBox())!;
    expect(time.x).toBeGreaterThan(circle.x + circle.width);
    expect(time.x + time.width).toBeLessThanOrEqual(box.x + box.width);
    expect(time.y).toBeGreaterThan(box.y + box.height / 2);
    expect(time.y + time.height).toBeLessThanOrEqual(box.y + box.height);
  });

  test("wears the old corner pill's gradient and pulses gently, but not under reduced motion", async ({
    page,
  }) => {
    await openArmB(page);
    // The circle: orange into violet into lavender, as the "Watch" pill's was.
    const fill = await page
      .locator('[data-testid="hero-video-play-icon"] > span')
      .last()
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(fill).toContain("rgb(254, 104, 57)");
    expect(fill).toContain("rgb(149, 142, 246)");
    const pulse = page.getByTestId("hero-video-play-pulse");
    const animation = () =>
      pulse.evaluate((el) => {
        const s = getComputedStyle(el);
        return { name: s.animationName, iterations: s.animationIterationCount };
      });
    expect(await animation()).toEqual({ name: "play-pulse", iterations: "infinite" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await animation()).name).toBe("none");
  });

  test("under a mouse, hovering grows the play button and dims the poster", async ({ page }) => {
    await openArmB(page);
    const canHover = await page.evaluate(
      () => matchMedia("(hover: hover) and (pointer: fine)").matches
    );
    test.skip(!canHover, "a touch screen has no hover");
    const circle = page.getByTestId("hero-video-play-icon");
    const veil = page.getByTestId("hero-video-play").locator("span").first();
    const scale = () => circle.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    const shade = () => veil.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await scale()).toBeCloseTo(1, 2);
    await page.getByTestId("hero-video-play").hover();
    await expect.poll(scale).toBeCloseTo(1.08, 2);
    await expect.poll(shade).toBe("rgba(22, 16, 33, 0.15)");
  });

  test("shows keyboard focus inside the box, where its rounded clip cannot cut it off", async ({
    page,
  }) => {
    await openArmB(page);
    const button = page.getByTestId("hero-video-play");
    // A key press first, so the focus below counts as a keyboard user's.
    await page.keyboard.press("Shift");
    await button.focus();
    const focusVisible = await button.evaluate((el) => el.matches(":focus-visible"));
    test.skip(!focusVisible, "this engine does not show focus-visible for a scripted focus");
    const ring = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset };
    });
    // The box clips its overflow, so a ring drawn outside the button is never seen.
    expect(ring).toEqual({ style: "solid", width: "3px", offset: "-3px" });
  });

  test("plays the full video with sound on a tap and hands over its controls", async ({ page }) => {
    await openArmB(page);
    await page.getByTestId("hero-video-play").click();
    await expect(page.getByTestId("hero-video-full")).toHaveAttribute("controls", "");
    await expect(page.getByTestId("hero-video-play")).toHaveCount(0);
    const played = await page.evaluate(
      () => (window as unknown as { __played: string[] }).__played
    );
    // The film, with sound, and nothing else ever played.
    expect(played).toEqual(["hero-video-full:sound"]);
  });

  test("keeps the hero's own call to action", async ({ page }) => {
    await page.goto("/?variant=white_video");
    await page.getByRole("link", { name: "Start my test now - hero" }).click();
    await page.waitForURL(/\/survey/);
  });

  test("sits where Figma puts it", async ({ page }) => {
    // The slot rises 24px into place on load; under reduced motion it starts there,
    // so the box is measured where it settles, not part-way up.
    await page.emulateMedia({ reducedMotion: "reduce" });
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

/**
 * Marcus's condensed phone hero (Figma Report-3.0 `1604:5505`, 12.10), both arms alike.
 * Below lg the slot sits right under the hero's button, so the video or question 1 is on
 * the first screen (it used to start some 280px lower). The rating, the "taking the test"
 * ticker and the privacy line follow the slot there, as the groups laid over the frame
 * draw them; from 1024 up they stay under the button, beside the slot.
 */
test.describe("Landing hero — the slot right under the button on a phone", () => {
  for (const [variant, slotId, gap] of [
    // The grid's 40px gap; the video sits 12px into it (group `1637:616`: 28px).
    ["white_card", "hero-card", 40],
    ["white_video", "hero-video", 28],
  ] as const) {
    test(`${variant}: the slot follows the button, and the rating, ticker and privacy line follow the slot`, async ({
      page,
    }) => {
      // The slot rises 24px into place on load; under reduced motion it starts there.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/?variant=${variant}`);
      const hero = page.locator("section", { has: page.locator("h1") }).first();
      // Each row renders twice, once per breakpoint; exactly one of each is on screen.
      const rows = [
        hero.getByText("4.9/5").filter({ visible: true }),
        hero.getByText("people are taking the test right now").filter({ visible: true }),
        hero.getByRole("link", { name: "Trust Center" }).filter({ visible: true }),
      ];
      for (const row of rows) await expect(row).toHaveCount(1);
      // The eyebrow above the headline went with the 12.10 copy (Figma `1604:8233`).
      await expect(hero.getByText("Anonymous · ~9 minutes · No account")).toHaveCount(0);
      const vw = page.viewportSize()!.width;
      const vh = page.viewportSize()!.height;
      // The paragraph runs on below lg, as the phone frame draws it; the break after
      // "research." is the desktop's alone.
      const br = hero.locator("h1 + p br");
      await expect(br).toHaveCount(1);
      expect(await br.evaluate((el) => getComputedStyle(el).display)).toBe(
        vw >= 1024 ? "inline" : "none"
      );
      const slot = await page.getByTestId(slotId).boundingBox();
      expect(slot).not.toBeNull();
      const [rating, ticker, privacy] = await Promise.all(rows.map((r) => r.boundingBox()));
      if (vw >= 1024) {
        // In the copy column, left of the slot.
        expect(rating!.x + rating!.width).toBeLessThan(slot!.x);
        return;
      }
      const cta = await page.getByRole("link", { name: "Start my test now - hero" }).boundingBox();
      expect(cta).not.toBeNull();
      expect(Math.abs(slot!.y - (cta!.y + cta!.height) - gap)).toBeLessThanOrEqual(2);
      // On the first screen of every phone project (iPhone 15 Pro's is 659px tall).
      expect(slot!.y).toBeLessThan(vh - 100);
      // Under the slot (the row starts 24px below it; its text line a little lower), in order.
      const below = rating!.y - (slot!.y + slot!.height);
      expect(below).toBeGreaterThanOrEqual(20);
      expect(below).toBeLessThanOrEqual(60);
      expect(ticker!.y).toBeGreaterThan(rating!.y);
      expect(privacy!.y).toBeGreaterThan(ticker!.y);
    });
  }
});
