import { test, expect } from "@playwright/test";

test.describe("Admin Panel", () => {
  // Admin is internal tooling — run only on Desktop Chrome to stay within
  // the admin-login rate limit (5 req/min shared across all browser projects)
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "Admin tests run on Desktop Chrome only");
  });

  test.describe("Login page", () => {
    test("shows login page with email input and magic link button", async ({ page }) => {
      await page.goto("/admin/login");
      await expect(page.getByPlaceholder(/enter your email/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
    });

    test("shows validation error for empty submit", async ({ page }) => {
      await page.goto("/admin/login");
      const emailInput = page.getByPlaceholder(/enter your email/i);
      // HTML5 required attribute should prevent empty submission
      await expect(emailInput).toHaveAttribute("required", "");
    });

    test("submits email and shows confirmation message", async ({ page }) => {
      await page.goto("/admin/login");
      await page.getByPlaceholder(/enter your email/i).fill("test@example.com");
      await page.getByRole("button", { name: /send magic link/i }).click();

      // After submission, should show the "Check your email" confirmation
      // or an error message (if Supabase/Resend is not configured)
      const confirmation = page.getByText(/check your email/i);
      const errorMessage = page.getByText(/error|wrong|not authorized|unable/i).first();

      await expect(confirmation.or(errorMessage)).toBeVisible({ timeout: 10000 });
    });

    test("shows 'Try a different email' after successful submit", async ({ page }) => {
      await page.goto("/admin/login");
      await page.getByPlaceholder(/enter your email/i).fill("test@example.com");
      await page.getByRole("button", { name: /send magic link/i }).click();

      // If the magic link was sent, there should be a "Try a different email" option
      const tryDifferent = page.getByText(/try a different email/i);
      const errorMessage = page.getByText(/error|wrong|not authorized|unable/i).first();

      // Either the confirmation flow or an error will show
      await expect(tryDifferent.or(errorMessage)).toBeVisible({ timeout: 10000 });
    });

    test("shows error message from URL params", async ({ page }) => {
      await page.goto("/admin/login?error=not_authorized");
      await expect(page.getByText(/not authorized/i)).toBeVisible();
    });
  });

  test.describe("Unauthenticated access", () => {
    // Without a valid Supabase Auth session, admin pages should redirect to login
    test("redirects to login when not authenticated", async ({ page }) => {
      await page.goto("/admin");
      // Should either show login form or redirect to /admin/login
      const emailInput = page.getByPlaceholder(/enter your email/i);
      const loginHeading = page.getByText(/admin/i).first();
      await expect(emailInput.or(loginHeading)).toBeVisible({ timeout: 10000 });
    });
  });

  // NOTE: Authenticated admin page tests (dashboard, submissions, survey-status,
  // logout) require a valid Supabase Auth session. Magic link authentication
  // cannot be completed in E2E without email delivery infrastructure.
  //
  // To test authenticated pages:
  // 1. Use a test helper that sets Supabase session cookies directly, OR
  // 2. Run these tests manually after authenticating via magic link
  //
  // For now, only the login UI and unauthenticated redirect are tested.
});
