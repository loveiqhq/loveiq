import { test, expect } from "@playwright/test";

// Visual regression tests - Desktop only (1280x720)
// First run creates golden images in e2e/visual-regression.spec.ts-snapshots/
// Subsequent runs compare against golden images
// Update golden images: npx playwright test visual-regression --update-snapshots

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

test.describe("Visual Regression", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

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
    await page.waitForTimeout(2000);
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
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("about-page.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("waitlist page full screenshot", async ({ page }) => {
    await page.goto("/waitlist");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("waitlist-page.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("survey intro screenshot", async ({ page }) => {
    await page.goto("/survey");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("survey-intro.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("glossary page screenshot", async ({ page }) => {
    await page.goto("/glossary");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("glossary-page.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("admin login page screenshot", async ({ page }) => {
    await page.goto("/admin/login");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("admin-login.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe("Component Visual Regression", () => {
  test.use({ viewport: { width: 412, height: 915 } }); // Mobile viewport

  test("nav mobile menu open state", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await disableAnimations(page);

    // Open hamburger menu
    const menuButton = page.locator("button[aria-label*='menu' i], button[aria-label*='Menu' i]");
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click();
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot("nav-mobile-menu-open.png", {
        maxDiffPixelRatio: 0.02,
      });
    }
  });
});
