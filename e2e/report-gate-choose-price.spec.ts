import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The EUR 1.99 page's price test (Marcus's RFD, 24 Nov 2026; board "Paygate · €1,99 (Figma
 * recreation) copy 2", then his hotfix of 27 Nov, "copy 3" and "Custom €0,00 · Are you sure?"):
 * the half that met the Core Archetype page picks its price instead, EUR 1.99, 6.99, 19.99 or its
 * own amount, EUR 0 only as an own amount it confirms. Behind `report_gate_choose_price` in
 * production; the
 * preview's `&price=1` draws it (app/api/report/preview/route.ts), and a preview's buttons open
 * the preview of the report after the unlock, with nothing bought.
 */
const URL = "/report?preview=1&v4=1&gate=1&price=1&archetype=spark-seeker";

const card = (page: Page) => page.locator(".iug-card--choose");
const cardCta = (page: Page) => card(page).locator(".rpg-card__cta");
const stickyCta = (page: Page) => page.getByTestId("iug-sticky").getByRole("button");
const zeroSheet = (page: Page) =>
  page.getByRole("dialog", { name: "Are You Sure? €0.00 Means Free." });

test.describe("The EUR 1.99 page's Choose your price half", () => {
  test("draws the board: the headline, four tiles with EUR 6.99 picked, and the box", async ({
    page,
  }) => {
    await page.goto(URL);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Unlock Your Sexual Archetypes"
    );
    await expect(
      page.getByRole("heading", { name: "Pay What Is Fair to You, Choose a Price." })
    ).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(4);
    await expect(page.getByRole("radio", { name: /€6\.99/ })).toBeChecked();
    await expect(cardCta(page)).toContainText("Unlock for €6.99");
    await expect(stickyCta(page)).toContainText("Unlock for €6.99 now");
    await expect(page.getByRole("heading", { name: "Why You Choose the Price" })).toBeVisible();
    await expect(
      page.getByRole("table", { name: "A fair guide by monthly net income" })
    ).toBeVisible();
    // EUR 1.99 if money is tight in the EUR 0 tile's place (27 Nov).
    await expect(card(page)).toContainText("If money is tight");
    await expect(card(page)).not.toContainText("Paying nothing is fair");

    // The page never scrolls sideways at phone width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the card's button and the bar follow the pick, the own amount included", async ({
    page,
  }) => {
    await page.goto(URL);
    await page.getByText("If money is tight", { exact: true }).click();
    await expect(cardCta(page)).toContainText("Unlock for €1.99");
    await expect(stickyCta(page)).toContainText("Unlock for €1.99 now");
    await page.getByText("Support our research", { exact: true }).click();
    await expect(cardCta(page)).toContainText("Unlock for €19.99");

    const amount = page.getByLabel("Your own amount in euros");
    await amount.fill("4,50");
    await expect(page.getByRole("radio", { name: "Your own amount" })).toBeChecked();
    await expect(cardCta(page)).toContainText("Unlock for €4.50");
    await amount.fill("0,20");
    await expect(cardCta(page)).toContainText("Enter your amount");
    await expect(card(page)).toContainText("Your own amount can be from €0.50 to €100.");
    // Nothing to charge: the bar's button sends the reader to the field instead.
    await stickyCta(page).click();
    await expect(amount).toBeFocused();
    await expect(page).toHaveURL(/price=1/);
  });

  test("an own amount of EUR 0 asks “Are you sure?” first, and only its last button takes it free", async ({
    page,
  }) => {
    await page.goto(URL);
    const amount = page.getByLabel("Your own amount in euros");
    await amount.fill("0");
    await expect(cardCta(page)).toContainText("Get my result for free");
    await expect(stickyCta(page)).toContainText("Get my result for free");
    await expect(card(page)).not.toContainText("Your own amount can be from");

    await cardCta(page).click();
    const sheet = zeroSheet(page);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "€6.99", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await sheet.getByRole("button", { name: "€19.99", exact: true }).click();
    await expect(sheet.getByRole("button", { name: "Unlock for €19.99" })).toBeVisible();
    await expect(
      sheet.getByRole("table", { name: "A fair guide by monthly net income" })
    ).toBeVisible();
    // It fits a phone's screen, its last button in reach.
    await expect(sheet.getByRole("button", { name: "Yes, continue for free" })).toBeInViewport();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(cardCta(page)).toBeFocused();
    await expect(page).toHaveURL(/price=1/);

    await cardCta(page).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Yes, continue for free" }).click();
    // A preview has nothing to buy: it opens the preview of the report after the unlock.
    await expect(page).toHaveURL(/plan=initial/);
  });

  // Review of #799: the sheet opens under the finger, and a double tap's second tap took EUR 0
  // from "Yes, continue for free", which opens where the bar's button was.
  test("a double tap on the bar's button stays on “Are you sure?”, taking nothing", async ({
    page,
  }) => {
    await page.goto(URL);
    await page.getByLabel("Your own amount in euros").fill("0");
    await expect(stickyCta(page)).toContainText("Get my result for free");
    // The second tap, 250 ms on, goes to whatever is under the finger by then. Timed in the
    // page, so a busy machine can't stretch the gap past the shield's 400 ms.
    await stickyCta(page).evaluate(async (button: HTMLElement) => {
      const r = button.getBoundingClientRect();
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const under = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (under instanceof HTMLElement) under.click();
    });
    await expect(zeroSheet(page)).toBeVisible();
    await page.waitForTimeout(500);
    await expect(zeroSheet(page)).toBeVisible();
    await expect(page).not.toHaveURL(/plan=initial/);
  });

  test("sits above the cookie banner while the banner is up", async ({ page }) => {
    await page.goto(URL);
    // CookieYes' banner as ConsentBannerOffset finds it: on the bottom edge, over everything.
    await page.evaluate(() => {
      const banner = document.createElement("div");
      banner.className = "cky-consent-container";
      banner.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;height:316px;z-index:9999999;background:#fff";
      document.body.appendChild(banner);
    });
    await page.getByLabel("Your own amount in euros").fill("0");
    await stickyCta(page).click();
    const free = zeroSheet(page).getByRole("button", { name: "Yes, continue for free" });
    await free.scrollIntoViewIfNeeded();
    // Playwright's own hit test: the button, not the banner, takes a tap there.
    await free.click({ trial: true, timeout: 5_000 });
  });

  test("its exit page names no EUR 1.99, and its buttons lead back to the picker", async ({
    page,
  }) => {
    await page.goto(URL);
    await page.getByRole("link", { name: /not ready to unlock yet/i }).click();
    await expect(page).toHaveURL(/leave=pre/);
    // The exit page's own words: the gate under it (hidden) has its EUR 1.99 tile since 27 Nov.
    await expect(page.locator(".pge-page")).not.toContainText("1.99");
    const choose = page.getByRole("button", { name: /^Choose your price/ });
    await expect(choose).toHaveCount(2);
    await choose.first().click();
    await expect(page).not.toHaveURL(/leave=pre/);
    await expect(page.getByRole("radio", { name: /€6\.99/ })).toBeFocused();
  });

  test("passes axe on the card and the box", async ({ page }) => {
    await page.goto(URL);
    await expect(card(page)).toBeVisible();
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished)
      )
    );
    const results = await new AxeBuilder({ page })
      .include(".iug-card--choose")
      .include(".iug-why-choose")
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    ).toEqual([]);
  });

  test("passes axe on the “Are you sure?” sheet", async ({ page }) => {
    await page.goto(URL);
    await page.getByLabel("Your own amount in euros").fill("0");
    await cardCta(page).click();
    await expect(zeroSheet(page)).toBeVisible();
    // An animation the sheet cut short (the page behind goes inert) rejects its `finished`.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined))
      )
    );
    const results = await new AxeBuilder({ page }).include(".iug-zero__sheet").analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    ).toEqual([]);
  });
});
