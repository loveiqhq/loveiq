import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The EUR 1.99 page's price test (Marcus's RFD, 24 Nov 2026; board "Paygate · €1,99 (Figma
 * recreation) copy 2"): the half that met the Core Archetype page picks its price instead,
 * EUR 0, 6.99, 19.99 or its own amount. Behind `report_gate_choose_price` in production; the
 * preview's `&price=1` draws it (app/api/report/preview/route.ts), and a preview's buttons open
 * the preview of the report after the unlock, with nothing bought.
 */
const URL = "/report?preview=1&v4=1&gate=1&price=1&archetype=spark-seeker";

const card = (page: Page) => page.locator(".iug-card--choose");
const cardCta = (page: Page) => card(page).locator(".rpg-card__cta");
const stickyCta = (page: Page) => page.getByTestId("iug-sticky").getByRole("button");

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
    await expect(page.locator("body")).not.toContainText("1.99");

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
    await page.getByText("Paying nothing is fair", { exact: true }).click();
    await expect(cardCta(page)).toContainText("Get my result for free");
    await expect(stickyCta(page)).toContainText("Get my result for free");
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

  test("its exit page names no EUR 1.99, and its buttons lead back to the picker", async ({
    page,
  }) => {
    await page.goto(URL);
    await page.getByRole("link", { name: /not ready to unlock yet/i }).click();
    await expect(page).toHaveURL(/leave=pre/);
    await expect(page.locator("body")).not.toContainText("1.99");
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
});
