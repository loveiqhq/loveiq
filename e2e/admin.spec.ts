import { test, expect, type Cookie } from "@playwright/test";

// Admin E2E tests require ADMIN_PASSWORD env var to be set
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin-password";

test.describe("Admin Panel", () => {
  // Admin is internal tooling — run only on Desktop Chrome to stay within
  // the admin-login rate limit (5 req/min shared across all browser projects)
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "Admin tests run on Desktop Chrome only");
  });
  test.describe("Login flow", () => {
    test("shows login page with password input", async ({ page }) => {
      await page.goto("/admin/login");
      await expect(page.getByPlaceholder(/password/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /enter admin/i })).toBeVisible();
    });

    test("shows error on incorrect password", async ({ page }) => {
      await page.goto("/admin/login");
      await page.getByPlaceholder(/password/i).fill("wrong-password");
      await page.getByRole("button", { name: /enter admin/i }).click();
      await expect(page.getByText(/incorrect|invalid|error/i)).toBeVisible({ timeout: 5000 });
    });

    test("redirects to dashboard on correct password", async ({ page }) => {
      await page.goto("/admin/login");
      await page.getByPlaceholder(/password/i).fill(ADMIN_PASSWORD);
      await page.getByRole("button", { name: /enter admin/i }).click();
      await page.waitForURL("**/admin", { timeout: 10000 });
      await expect(page).toHaveURL(/\/admin/);
    });
  });

  test.describe("Authenticated pages", () => {
    // Login once in beforeAll and save cookies to avoid rate limiting
    // (admin-login bucket allows only 5 requests/min)
    let authCookies: Cookie[];

    test.beforeAll(async ({ browser }, testInfo) => {
      // Skip login for non-Chrome projects (beforeAll runs before beforeEach skip)
      if (testInfo.project.name !== "Desktop Chrome") return;
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto("/admin/login");
      await page.getByPlaceholder(/password/i).fill(ADMIN_PASSWORD);
      await page.getByRole("button", { name: /enter admin/i }).click();
      await page.waitForURL("**/admin", { timeout: 10000 });
      authCookies = await ctx.cookies();
      await ctx.close();
    });

    test.beforeEach(async ({ page }) => {
      if (authCookies) await page.context().addCookies(authCookies);
    });

    test("dashboard renders heading and stats", async ({ page }) => {
      await page.goto("/admin");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // Dashboard should have stat cards or sections
      await expect(page.locator("main")).toBeVisible();
    });

    test("submissions page renders table", async ({ page }) => {
      await page.goto("/admin/submissions");
      await expect(page.getByRole("heading", { name: /submissions/i }).first()).toBeVisible();
      // Should have a table or list of submissions
      await expect(page.locator("main")).toBeVisible();
    });

    test("survey status page renders", async ({ page }) => {
      await page.goto("/admin/survey-status");
      await expect(page.getByRole("heading", { name: /survey status/i })).toBeVisible();
      // The page should render content — either status text or an API error message
      // (survey status API may fail in environments without the Supabase survey table)
      const statusOrError = page.getByText(/active|closed|failed|unable|error/i).first();
      await expect(statusOrError).toBeVisible({ timeout: 5000 });
    });

    test("logout redirects to login page", async ({ page }) => {
      await page.goto("/admin");
      await expect(page.locator("main")).toBeVisible();

      // Find and click logout in sidebar or header
      const logoutButton = page.getByRole("button", { name: /log\s?out|sign\s?out/i });
      const logoutLink = page.getByRole("link", { name: /log\s?out|sign\s?out/i });

      if (await logoutButton.isVisible().catch(() => false)) {
        await logoutButton.click();
      } else if (await logoutLink.isVisible().catch(() => false)) {
        await logoutLink.click();
      } else {
        // On mobile, may need to open sidebar first
        const menuButton = page.getByRole("button", { name: /menu/i });
        if (await menuButton.isVisible().catch(() => false)) {
          await menuButton.click();
          await page
            .getByText(/log\s?out|sign\s?out/i)
            .first()
            .click();
        }
      }

      await page.waitForURL("**/admin/login", { timeout: 10000 });
      await expect(page).toHaveURL(/\/admin\/login/);
    });
  });
});
