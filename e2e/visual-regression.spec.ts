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
//   glossary-page         last reviewed: 2026-05-11 — initial baseline
//   admin-login           last reviewed: 2026-05-11 — initial baseline
//   nav-mobile-menu-open  last reviewed: 2026-06-19 — white landing nav (dark A/B retired)
//
// To refresh: bump the date here, run `npx playwright test visual-regression
// --update-snapshots --project="Desktop Chrome"`, eyeball every diff, commit.

// Helper to disable all animations/transitions for stable screenshots
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
      video { visibility: hidden !important; }
    `,
  });
}

// Deterministic "everything has settled" wait — replaces ad-hoc waitForTimeout
// in screenshot tests. Waits for fonts to load and one extra requestAnimationFrame
// pass so any layout caused by font-swap is visible before capture.
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
    // Force all scroll-triggered elements visible (full-page capture triggers scroll animations)
    await page.addStyleTag({
      content: `
        .animate-on-scroll { opacity: 1 !important; transform: none !important; }
        .reveal-on-scroll { opacity: 1 !important; transform: none !important; }
        iframe { visibility: hidden !important; }
      `,
    });
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
