import { test, expect } from "@playwright/test";

test.describe("Survey — Intro screen", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => {
      if (err.message.toLowerCase().includes("cookieyes")) return;
    });
    await page.goto("/survey");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  });

  test("shows intro heading and Continue button", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /prepare you well to discover your sexual archetypes/i })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /continue/i }).first()).toBeVisible();
  });

  test("avatar button has correct aria-label", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Continue to survey introduction" })
    ).toBeVisible();
  });

  test("clicking Continue transitions to slide 1", async ({ page }) => {
    await page
      .getByRole("button", { name: /continue/i })
      .first()
      .click();
    // Intro transition takes 1200ms — wait for slide 1 heading to appear
    await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("Survey — Slide navigation", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => {
      if (err.message.toLowerCase().includes("cookieyes")) return;
    });
    await page.goto("/survey");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    // Navigate past intro
    await page
      .getByRole("button", { name: /continue/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible({
      timeout: 5000,
    });
  });

  test("slide 1 shows correct heading and step counter", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible();
    await expect(page.getByText("1 / 4")).toBeVisible();
  });

  test("back button is not interactive on slide 1", async ({ page }) => {
    const backBtn = page.getByRole("button", { name: "Go to previous slide" });
    // Back button exists but has pointer-events-none / opacity-0 on first slide
    await expect(backBtn).toHaveCSS("pointer-events", "none");
  });

  test("Continue advances through all 4 slides", async ({ page }) => {
    const continueBtn = page.getByRole("button", { name: "Continue to next slide" });

    // Slide 1 → 2
    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /judgment-free zone/i })).toBeVisible();
    await expect(page.getByText("2 / 4")).toBeVisible();

    // Back button is now interactive on slide 2
    const backBtn = page.getByRole("button", { name: "Go to previous slide" });
    await expect(backBtn).not.toHaveCSS("pointer-events", "none");

    // Slide 2 → 3
    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /your privacy matters/i })).toBeVisible();
    await expect(page.getByText("3 / 4")).toBeVisible();

    // Slide 3 → 4
    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /how the survey works/i })).toBeVisible();
    await expect(page.getByText("4 / 4")).toBeVisible();
  });

  test("back button returns to previous slide", async ({ page }) => {
    const continueBtn = page.getByRole("button", { name: "Continue to next slide" });
    const backBtn = page.getByRole("button", { name: "Go to previous slide" });

    // Go to slide 2
    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /judgment-free zone/i })).toBeVisible();

    // Go back to slide 1
    await backBtn.click();
    await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible();
    await expect(page.getByText("1 / 4")).toBeVisible();
  });

  test("slide 4 Continue transitions to consent screen", async ({ page }) => {
    const continueBtn = page.getByRole("button", { name: "Continue to next slide" });

    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /judgment-free zone/i })).toBeVisible();

    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /your privacy matters/i })).toBeVisible();

    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /how the survey works/i })).toBeVisible();

    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /before we begin/i })).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("Survey — Skip Intro", () => {
  test("clicking Skip Intro jumps to consent screen", async ({ page }) => {
    page.on("pageerror", (err) => {
      if (err.message.toLowerCase().includes("cookieyes")) return;
    });
    await page.goto("/survey");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    // Navigate past intro to see Skip Intro button
    await page
      .getByRole("button", { name: /continue/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible({
      timeout: 5000,
    });

    await page.getByRole("button", { name: /skip intro/i }).click();
    await expect(page.getByRole("heading", { name: /before we begin/i })).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("Survey — Keyboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => {
      if (err.message.toLowerCase().includes("cookieyes")) return;
    });
    await page.goto("/survey");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    // Navigate past intro
    await page
      .getByRole("button", { name: /continue/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible({
      timeout: 5000,
    });
  });

  test("ArrowRight advances to next slide", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: /judgment-free zone/i })).toBeVisible();
  });

  test("ArrowLeft goes back to previous slide", async ({ page }) => {
    // First go to slide 2
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: /judgment-free zone/i })).toBeVisible();

    // Then go back to slide 1
    await page.locator("body").click({ position: { x: 20, y: 20 } });
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible();
  });

  test("ArrowLeft does nothing on slide 1", async ({ page }) => {
    await page.keyboard.press("ArrowLeft");
    // Still on slide 1
    await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible();
    await expect(page.getByText("1 / 4")).toBeVisible();
  });
});

test.describe("Survey — Consent screen", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => {
      if (err.message.toLowerCase().includes("cookieyes")) return;
    });
    await page.goto("/survey");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
    // Navigate past intro
    await page
      .getByRole("button", { name: /continue/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible({
      timeout: 5000,
    });
    // Skip to consent
    await page.getByRole("button", { name: /skip intro/i }).click();
    await expect(page.getByRole("heading", { name: /before we begin/i })).toBeVisible({
      timeout: 5000,
    });
  });

  test("shows 18+ badge and heading", async ({ page }) => {
    await expect(page.getByText("18+")).toBeVisible();
    await expect(page.getByRole("heading", { name: /before we begin/i })).toBeVisible();
  });

  test("age checkbox starts unchecked and can be toggled", async ({ page }) => {
    const checkboxes = page.getByRole("checkbox");
    const ageCheckbox = checkboxes.first();

    await expect(ageCheckbox).toHaveAttribute("aria-checked", "false");
    await ageCheckbox.click();
    await expect(ageCheckbox).toHaveAttribute("aria-checked", "true");
  });

  test("terms checkbox starts unchecked and can be toggled", async ({ page }) => {
    const termsCheckbox = page.getByRole("checkbox").nth(1);

    await expect(termsCheckbox).toHaveAttribute("aria-checked", "false");
    // Click the checkbox indicator (small square on left), not the label text which contains links
    await termsCheckbox.locator("div").first().click();
    await expect(termsCheckbox).toHaveAttribute("aria-checked", "true");
  });

  test("I agree button is disabled until both checkboxes are checked", async ({ page }) => {
    const agreeBtn = page.getByRole("button", { name: /i agree/i });
    const ageCheckbox = page.getByRole("checkbox").first();
    const termsCheckbox = page.getByRole("checkbox").nth(1);

    // Initially disabled
    await expect(agreeBtn).toBeDisabled();

    // Check only age — still disabled
    await ageCheckbox.click();
    await expect(agreeBtn).toBeDisabled();

    // Check terms too — now enabled (click indicator, not label links)
    await termsCheckbox.locator("div").first().click();
    await expect(agreeBtn).toBeEnabled();
  });

  test("Return to site button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /return to site/i })).toBeVisible();
  });

  test("consent legal links have correct hrefs", async ({ page }) => {
    const links = [
      { name: /privacy policy/i, href: "/privacy-policy" },
      { name: /terms & conditions/i, href: "/terms-and-conditions" },
      { name: /terms of use/i, href: "/terms-of-use" },
      { name: /digital content & subscription terms/i, href: "/digital-content-terms" },
      { name: /medical & psychological disclaimer/i, href: "/medical-disclaimer" },
    ];

    for (const { name, href } of links) {
      await expect(page.getByRole("link", { name }).first()).toHaveAttribute("href", href);
    }
  });
});

test.describe("Survey — Full happy path", () => {
  test("intro → slides 1-4 → consent → agree → questions", async ({ page }) => {
    page.on("pageerror", (err) => {
      if (err.message.toLowerCase().includes("cookieyes")) return;
    });
    await page.goto("/survey");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });

    // Intro → click Continue
    await expect(
      page.getByRole("heading", { name: /prepare you well to discover your sexual archetypes/i })
    ).toBeVisible();
    await page
      .getByRole("button", { name: /continue/i })
      .first()
      .click();

    // Slide 1
    await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible({
      timeout: 5000,
    });

    const continueBtn = page.getByRole("button", { name: "Continue to next slide" });

    // Slide 2
    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /judgment-free zone/i })).toBeVisible();

    // Slide 3
    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /your privacy matters/i })).toBeVisible();

    // Slide 4
    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /how the survey works/i })).toBeVisible();

    // Consent
    await continueBtn.click();
    await expect(page.getByRole("heading", { name: /before we begin/i })).toBeVisible({
      timeout: 5000,
    });

    // Check both boxes (click indicator on terms checkbox to avoid links)
    await page.getByRole("checkbox").first().click();
    await page.getByRole("checkbox").nth(1).locator("div").first().click();

    // Agree → enters SurveyEngine
    await page.getByRole("button", { name: /i agree/i }).click();

    // --- Q1: "What is your email?" (open/email, required) ---
    await expect(page.getByRole("heading", { name: /what is your email/i })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("0%")).toBeVisible();
    await expect(page.getByRole("button", { name: /previous/i })).toBeDisabled();

    // Dismiss chapter intro popup (GuideAvatar) so it doesn't block clicks on mobile
    const gotItBtn = page.getByRole("button", { name: /got it/i });
    if (await gotItBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await gotItBtn.click();
    }

    await page.getByRole("textbox").fill("test@example.com");

    // --- Q2: "What is your name?" (open/text, required) ---
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByRole("heading", { name: /what is your name/i })).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole("textbox").fill("Test");

    // --- Q3: scale question about satisfaction ---
    await page.getByRole("button", { name: /next/i }).click();
    await expect(page.getByRole("heading", { name: /satisfied/i })).toBeVisible({ timeout: 5000 });

    // --- Go back and verify persistence ---
    await page.getByRole("button", { name: /previous/i }).click();
    await expect(page.getByRole("heading", { name: /what is your name/i })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("textbox")).toHaveValue("Test");

    // --- Pause / Exit navigates to homepage ---
    await page.getByRole("button", { name: /pause/i }).click();
    await page.waitForURL("/", { timeout: 5000 });
  });
});
