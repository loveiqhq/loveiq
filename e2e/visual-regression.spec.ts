import { test, expect } from "@playwright/test";

// Visual regression tests - Desktop only (1280x720)
// First run creates golden images in e2e/visual-regression.spec.ts-snapshots/
// Subsequent runs compare against golden images
// Update golden images: npx playwright test visual-regression --update-snapshots
//
// ─── BASELINE FRESHNESS ─────────────────────────────────────────────────────
// Track when each spec's golden images were last reviewed against the live UI.
// If a baseline gets older than ~90 days, schedule a refresh — otherwise
// "no regression" silently rots and stale screenshots become noise.
//
//   landing-page          last reviewed: 2026-06-19 — white landing (dark A/B retired)
//   about-page            last reviewed: 2026-05-11 — initial baseline
//   survey-intro          last reviewed: 2026-05-11 — initial baseline
//   glossary-page         last reviewed: 2026-06-27 — full-white redesign
//   glossary-term-page    last reviewed: 2026-06-27 — full-white redesign (new baseline)
//   admin-login           last reviewed: 2026-05-11 — initial baseline
//   nav-mobile-menu-open  last reviewed: 2026-06-19 — white landing nav (dark A/B retired)
//
// To refresh: bump the date here, run `npx playwright test visual-regression
// --update-snapshots --project="Desktop Chrome"`, eyeball every diff, commit.

// Helper to disable all animations/transitions for stable screenshots, AND to
// force scroll-reveal elements visible.
//
// The reveal rules belong here rather than in individual tests: a `fullPage`
// capture stitches the page without ever scrolling it, so anything still waiting
// on its IntersectionObserver stays at opacity 0 and is captured as blank space.
// Three tests used to inject these rules themselves and four did not, which is
// why the about-page baseline came out as a hero, six thousand blank pixels and a
// footer. Every test calls this helper, so putting them here covers all of them.
async function disableAnimations(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
      }
      .animate-on-scroll,
      .reveal-on-scroll {
        opacity: 1 !important;
        transform: none !important;
      }
      video,
      iframe {
        visibility: hidden !important;
      }
    `,
  });
}

// Deterministic "everything has settled" wait — replaces ad-hoc waitForTimeout
// in screenshot tests. Waits for fonts to load, forces every lazy image to load
// and waits for it, then gives one extra requestAnimationFrame pass so any layout
// caused by font-swap is visible before capture.
//
// The lazy-image step matters for `fullPage` captures. next/image emits
// loading="lazy" unless it is marked priority, so an image below the fold may or
// may not have arrived by capture time — networkidle does not help, because the
// request is never made until the element approaches the viewport. That is a
// coin-flip baseline: the about page's two leadership photos came out as empty
// grey boxes. Flipping them to eager and awaiting each one removes the race.
async function waitForVisualReady(page: import("@playwright/test").Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const done = () => requestAnimationFrame(() => resolve());
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(done);
        } else {
          done();
        }
      })
  );

  await page.evaluate(async () => {
    const images = Array.from(document.images);
    for (const img of images) {
      img.loading = "eager";
    }
    await Promise.all(
      images
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise<void>((resolve) => {
              // resolve on error too — a genuinely broken image should show up as a
              // diff against the baseline, not hang the test until it times out
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            })
        )
    );
  });

  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

test.describe("Visual Regression", () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "Desktop Chrome",
      "Visual baselines are maintained for Desktop Chrome only."
    );
  });

  test("landing page full screenshot", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);
    // Landing page has lots of scroll-triggered content + late-arriving images.
    // Wait for fonts + network idle a second time to catch any deferred fetches.
    await waitForVisualReady(page);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("landing-page.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      timeout: 30000,
    });
  });

  test("about page full screenshot", async ({ page }) => {
    await page.goto("/about");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);
    await waitForVisualReady(page);
    await expect(page).toHaveScreenshot("about-page.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("survey intro screenshot", async ({ page }) => {
    await page.goto("/survey");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);
    await waitForVisualReady(page);
    await expect(page).toHaveScreenshot("survey-intro.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("glossary page screenshot", async ({ page }) => {
    await page.goto("/glossary");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);
    await waitForVisualReady(page);
    await expect(page).toHaveScreenshot("glossary-page.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("glossary term page screenshot", async ({ page }) => {
    await page.goto("/glossary/abandonment-insecurity");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);
    await waitForVisualReady(page);
    await expect(page).toHaveScreenshot("glossary-term-page.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("admin login page screenshot", async ({ page }) => {
    await page.goto("/admin/login");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);
    await waitForVisualReady(page);
    await expect(page).toHaveScreenshot("admin-login.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe("Component Visual Regression", () => {
  test.use({ viewport: { width: 412, height: 915 } }); // Mobile viewport
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "Mobile Chrome",
      "Component visual baselines are maintained for Mobile Chrome only."
    );
  });

  test("nav mobile menu open state", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);

    // Open hamburger menu
    const menuButton = page.locator("button[aria-label*='menu' i], button[aria-label*='Menu' i]");
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click();
      await waitForVisualReady(page);
      await expect(page).toHaveScreenshot("nav-mobile-menu-open.png", {
        maxDiffPixelRatio: 0.02,
      });
    }
  });
});
