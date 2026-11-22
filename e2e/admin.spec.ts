import { test, expect } from "@playwright/test";

test.describe("Admin Panel", () => {
  // Admin is internal tooling — run only on Desktop Chrome to stay within
  // the admin-login rate limit (5 req/min shared across all browser projects)
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "Desktop Chrome", "Admin tests run on Desktop Chrome only");
  });

  test.describe("Login page", () => {
    test("asks for the team password only (22 Nov 2026)", async ({ page }) => {
      await page.goto("/admin/login");
      const password = page.getByLabel("Password");
      await expect(password).toBeVisible();
      await expect(password).toHaveAttribute("type", "password");
      await expect(password).toHaveAttribute("required", "");
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      await expect(page.getByText(/magic link|enter your email/i)).toHaveCount(0);
    });

    test("refuses a wrong password and stays on the form", async ({ page }) => {
      await page.goto("/admin/login");
      await page.getByLabel("Password").fill("not-the-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      // Incorrect password with Supabase configured; a plain error without it (CI's build). The
      // form's alert: Next's route announcer is a role="alert" too.
      await expect(page.locator("form").getByRole("alert")).toHaveText(
        /incorrect password|unable to process|something went wrong|try again later/i,
        { timeout: 10000 }
      );
      await expect(page).toHaveURL(/\/admin\/login/);
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
      await expect(page).toHaveURL(/\/admin\/login(?:\?|$)/, { timeout: 10000 });
      await expect(page.getByLabel("Password")).toBeVisible();
    });
  });

  // NOTE: signed-in pages need the team password, whose server secret CI doesn't have. The
  // signed-in walk (right password, the page it was for, idle, sign-out) is run against a
  // local production build before each change to the sign-in (docs/runbooks/SECURITY.md).
});
