import { test, expect } from "@playwright/test";

// Desktop nav is visible at lg breakpoint (1024px+).
// Hamburger is visible below sm breakpoint (640px).
//
// test.use() forces a specific viewport for each describe block, so these tests
// run correctly on every browser project without any runtime skipping.

test.describe("Desktop navigation", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("logo is visible", async ({ page }) => {
    // The nav logo link wraps the LoveIQ text
    await expect(page.locator("nav").getByRole("link", { name: /loveiq/i })).toBeVisible();
  });

  test("nav links are visible", async ({ page }) => {
    // At 1024px+, the hidden lg:flex container shows the full nav links
    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "Home" }).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: "About Us" }).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: "Glossary" }).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: "Trust Zone" }).first()).toBeVisible();
  });

  test("CTA button is visible", async ({ page }) => {
    // The "Start test now" CTA in the nav
    await expect(
      page
        .locator("nav")
        .getByRole("link", { name: /start test now/i })
        .first()
    ).toBeVisible();
  });

  test("hamburger button is not visible", async ({ page }) => {
    // The hamburger has sm:hidden (hidden at 640px+)
    await expect(page.getByRole("button", { name: /open menu|close menu/i })).not.toBeVisible();
  });
});

test.describe("Mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  });

  test("hamburger button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  });

  test("mobile menu is closed initially", async ({ page }) => {
    const menu = page.locator('[role="menu"]');
    await expect(menu).not.toHaveClass(/is-open/);
  });

  test("clicking hamburger opens the menu", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.locator('[role="menu"]')).toHaveClass(/is-open/);
    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
  });

  test("clicking hamburger again closes the menu", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.locator('[role="menu"]')).toHaveClass(/is-open/);
    await page.getByRole("button", { name: "Close menu" }).click();
    await expect(page.locator('[role="menu"]')).not.toHaveClass(/is-open/);
  });

  test("Escape key closes the menu", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.locator('[role="menu"]')).toHaveClass(/is-open/);
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="menu"]')).not.toHaveClass(/is-open/);
  });

  test("clicking a nav link from the menu navigates", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.locator('[role="menu"]')).toHaveClass(/is-open/);
    await page.getByRole("menuitem", { name: "About Us" }).click();
    await expect(page).toHaveURL(/\/about/);
  });
});
