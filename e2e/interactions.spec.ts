import { test, expect } from "@playwright/test";

test.describe("FAQ accordion (landing page)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for React hydration — Safari (WebKit) hydrates slower than V8 and
    // clicks on non-hydrated elements don't trigger React onClick handlers.
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  });

  test("clicking a question reveals the answer", async ({ page }) => {
    // The first FAQ question in S13FAQ
    const firstQuestion = page.getByRole("button", {
      name: /is this a test or an ongoing journey/i,
    });
    await expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
    await firstQuestion.click();
    await expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
    // Answer text is now visible
    await expect(page.getByText(/loveiq is not a one-off quiz/i)).toBeVisible();
  });

  test("clicking the same question again hides the answer", async ({ page }) => {
    const firstQuestion = page.getByRole("button", {
      name: /is this a test or an ongoing journey/i,
    });
    await firstQuestion.click();
    await expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
    await firstQuestion.click();
    await expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
  });

  test("multiple questions can be opened independently", async ({ page }) => {
    const first = page.getByRole("button", { name: /is this a test or an ongoing journey/i });
    const second = page.getByRole("button", { name: /what exactly does this app do/i });
    await first.click();
    await second.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(second).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("CTA buttons", () => {
  test("nav CTA links to /survey", async ({ page }) => {
    await page.goto("/");
    const navCta = page
      .locator("nav")
      .getByRole("link", { name: /start survey now/i })
      .first();
    await expect(navCta).toHaveAttribute("href", "/survey");
  });
});

test.describe("Footer links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Privacy Policy link has correct href", async ({ page }) => {
    await expect(
      page.locator("footer").getByRole("link", { name: "Privacy Policy" })
    ).toHaveAttribute("href", "/privacy-policy");
  });

  test("Terms of Use link has correct href", async ({ page }) => {
    await expect(
      page.locator("footer").getByRole("link", { name: "Terms of Use" })
    ).toHaveAttribute("href", "/terms-of-use");
  });

  test("Imprint link has correct href", async ({ page }) => {
    await expect(page.locator("footer").getByRole("link", { name: "Imprint" })).toHaveAttribute(
      "href",
      "/imprint"
    );
  });

  test("Terms and Conditions link has correct href", async ({ page }) => {
    await expect(
      page.locator("footer").getByRole("link", { name: /terms & conditions/i })
    ).toHaveAttribute("href", "/terms-and-conditions");
  });
});

test.describe("Waitlist form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/waitlist");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  });

  test("email input is present", async ({ page }) => {
    await expect(page.getByRole("textbox", { name: /email address/i })).toBeVisible();
  });

  test("submit button is present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /join waitlist/i })).toBeVisible();
  });

  test("submitting without a valid email shows a validation error", async ({ page }) => {
    // The email input is required; submit without a value
    await page.getByRole("button", { name: /join waitlist/i }).click();
    // Expect the error status region to contain an error message
    await expect(page.locator('[role="status"]').filter({ hasText: /valid email/i })).toBeVisible();
  });
});
