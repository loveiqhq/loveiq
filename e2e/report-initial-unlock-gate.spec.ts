import { expect, test, type Page } from "@playwright/test";

import { buildInitialGateFixture, buildReportFixture, guidedTourKey } from "./fixtures/report";

/**
 * Pre-unlock: the EUR 1.99 gate (Figma Report-3.0 1604:2374), end to end against mocked
 * APIs. The gate is decided on the server, so /api/report answers the gate in place of the
 * report; after the EUR 1.99 it answers the report, with the Core Archetype unlocked.
 */
const TOKEN = "rpt_e2eGateAbCdEfGhIjKlM";

/** /api/report: the gate until `paid()` says the EUR 1.99 went through, then the report. */
async function mockGate(page: Page, paid: () => boolean = () => false) {
  // The guided tour starts on a report's first open, remembered per report; these specs are
  // about the pages under it. The gated reader's submission is the report's after the EUR 1.99.
  await page.addInitScript(
    (key) => {
      try {
        window.localStorage.setItem(key, "seen");
      } catch {
        // No storage: then the tour cannot remember itself and never starts either.
      }
    },
    guidedTourKey(buildInitialGateFixture(TOKEN).submissionId)
  );
  await page.route("**/api/report?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        paid() ? buildReportFixture(0, { initialUnlock: true }) : buildInitialGateFixture(TOKEN)
      ),
    });
  });
}

test.describe("The EUR 1.99 gate", () => {
  test("stops a gated reader at the EUR 1.99 page, with no report behind it", async ({ page }) => {
    await mockGate(page);
    await page.goto(`/report/${TOKEN}`);

    await expect(page.getByRole("heading", { level: 1, name: /Sexual Archetypes/ })).toBeVisible();
    await expect(page.locator(".iug-card .rpg-card__amount")).toHaveText("€1.99");
    await expect(page.getByText("14-day money-back guarantee.")).toBeVisible();
    await expect(page.locator(".rv4")).toHaveCount(0);
  });

  test("pays the EUR 1.99 and comes back to the top of the report", async ({
    page,
    browserName,
  }) => {
    let paid = false;
    let csrf: string | undefined;
    await mockGate(page, () => paid);
    await page.route("**/api/stripe/initial-unlock", async (route) => {
      csrf = route.request().headers()["x-csrf-token"];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          url: `/checkout/return?plan=initial&session_id=cs_test_e2e&token=${TOKEN}`,
        }),
      });
    });
    await page.route("**/api/stripe/checkout-session-status**", async (route) => {
      paid = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          paymentStatus: "paid",
          sessionStatus: "complete",
          accessPlan: null,
          initialUnlock: true,
        }),
      });
    });
    const urls: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) urls.push(frame.url());
    });

    await page.goto(`/report/${TOKEN}`);
    await page.locator(".iug-card .rpg-card__cta").click();

    // No other spec opens /checkout/return, so this is the server's first render of it; on
    // CI's WebKit that has outlasted 15 s.
    await expect(page.locator(".rv4")).toBeVisible({ timeout: 30_000 });
    // The header is the page's CSRF cookie, as the page reads it (getCsrfToken). WebKit keeps
    // that Secure cookie from scripts on http://localhost (production is https), or refuses
    // it outright on Linux, so there the page has none to send.
    const pageCsrf = await page.evaluate(() => {
      const row = document.cookie
        .split("; ")
        .find((r) => r.startsWith("__Host-csrf=") || r.startsWith("__csrf="));
      return row?.substring(row.indexOf("=") + 1) ?? "";
    });
    if (browserName !== "webkit") expect(pageCsrf).toBeTruthy();
    expect(csrf ?? "", "the EUR 1.99 checkout is posted with the CSRF header").toBe(pageCsrf);
    // Back from Stripe through ?unlocked=initial, which the report then drops.
    await expect.poll(() => urls.some((u) => u.includes("unlocked=initial"))).toBe(true);
    await expect(page).toHaveURL(new RegExp(`/report/${TOKEN}$`));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("under reduced motion, shows the badge with no progress bar", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockGate(page);
    await page.goto(`/report/${TOKEN}`);

    await expect(page.getByText("Your Core Archetype was determined")).toBeVisible();
    await expect(page.getByTestId("iug-progress")).toHaveCount(0);
  });
});

test.describe("The EUR 1.99 gate on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("hands the button to the sticky bar once the card's scrolls away", async ({ page }) => {
    let posted = 0;
    await mockGate(page);
    await page.route("**/api/stripe/initial-unlock", async (route) => {
      posted += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: false, message: "Checkout preview only." }),
      });
    });
    await page.goto(`/report/${TOKEN}`);

    const sticky = page.getByTestId("iug-sticky");
    await expect(sticky).toHaveAttribute("data-visible", "false");
    // One screen at a time, polling: WebKit reports the observer every 100-200 ms.
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect(sticky).toHaveAttribute("data-visible", "true");

    await sticky.getByRole("button", { name: /Unlock for €1\.99 now/ }).click();
    await expect.poll(() => posted).toBe(1);
    await expect(sticky.getByText("Checkout preview only.")).toBeVisible();
  });
});
