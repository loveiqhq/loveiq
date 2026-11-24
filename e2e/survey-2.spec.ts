import { test, expect, type Page } from "@playwright/test";

import { surveyQuestions } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { orderAskedQuestions } from "../features/survey/ui/questionOrder";
import { instantScroll } from "./fixtures/instant-scroll";

/**
 * Survey 2.0 (Mark's survey review, behind the `survey_2` switch) in a real browser, through the
 * `?order=survey2` preview (the production build allows it only where the test server sets
 * SURVEY_SHEETS_PREVIEW=1, see playwright.config.ts): its short guide and two-tick consent, then
 * every one of its 61 screens in Mark's order with the six sheets at his spots, the one-page
 * details screen, and what the submission carries.
 *
 * NOTHING IS WRITTEN. Every survey write is answered locally.
 */

const SCREENS = orderAskedQuestions(surveyQuestions, "survey2").filter((q) => !isHidden(q.qId));
type Screen = (typeof SCREENS)[number];

const DETAILS = "Last step to your report to become a more intelligent lover";
const NAME = "E2E";
const EMAIL = "e2e-survey2@loveiq.org";
/** The newsletter switch under the email (Mark's board 2b). */
const SWITCH = "Keep learning after your report";

const WRITES = [
  "**/api/survey-partial",
  "**/api/survey-tracking",
  "**/api/analytics-event",
  "**/api/funnel-event",
];

async function quietWrites(page: Page): Promise<void> {
  for (const p of WRITES) {
    await page.route(p, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );
  }
}

/** The submission, answered as the server would; returns what it carried. */
async function catchSubmit(page: Page): Promise<() => Record<string, unknown> | null> {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/survey", async (route) => {
    body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, reportToken: "stub", submissionId: 1 }),
    });
  });
  return () => body;
}

const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true });
const continueCard = (page: Page) =>
  page
    .getByRole("button", { name: /continue to next slide/i })
    .filter({ visible: true })
    .first();

/**
 * A sheet between questions, read past as a person would (it ignores taps for 400 ms): its id,
 * or null when none is open.
 */
async function pastSheet(page: Page): Promise<string | null> {
  const sheet = page.locator("[data-survey-sheet]").first();
  if (!(await sheet.isVisible().catch(() => false))) return null;
  const id = await sheet.getAttribute("data-survey-sheet");
  await page.waitForTimeout(450);
  const keepGoing = sheet.locator("[data-sheet-keep-going]");
  await ((await keepGoing.count()) ? keepGoing : sheet.getByRole("button", { name: /^next$/i }))
    .first()
    .click();
  return id ?? "?";
}

/** Presses the first option, opening its group first where the group starts closed. */
async function pressFirst(page: Page, role: "radio" | "checkbox"): Promise<void> {
  const option = page.locator(`[role="${role}"]`).first();
  const closed = await option.evaluate((el) => el.closest("[inert]")?.id ?? null);
  if (closed) await page.locator(`button[aria-controls="${closed}"]`).click();
  await option.click();
}

async function answer(page: Page, q: Screen): Promise<void> {
  if (q.answerType === "scale") {
    await page.getByRole("button", { name: "4 of 7", exact: true }).click();
  } else if (q.answerType === "single") {
    await pressFirst(page, "radio");
  } else if (q.answerType === "multiple") {
    await pressFirst(page, "checkbox");
  } else if (q.answerType === "open") {
    const boxes = page.getByRole("textbox");
    for (let b = 0, n = await boxes.count(); b < n; b += 1) await boxes.nth(b).fill("e2e");
  }
}

test.describe("Survey 2.0", () => {
  test("opens on the short guide, and its consent asks for the 18+ and the answers apart", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await quietWrites(page);
    await instantScroll(page);
    await page.goto("/survey?order=survey2");
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });

    await expect(
      page.getByRole("heading", { name: "Three rules to increase your report quality:" })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("1 / 3")).toBeVisible();
    await continueCard(page).click();
    await expect(
      page.getByRole("heading", { name: "Answer from the perspective of today" })
    ).toBeVisible();
    await continueCard(page).click();
    await expect(page.getByRole("heading", { name: "Your Privacy Matters" })).toBeVisible();
    await continueCard(page).click();

    await expect(page.getByRole("heading", { name: /before we begin/i })).toBeVisible({
      timeout: 10_000,
    });
    const [age, data] = [page.getByRole("checkbox").first(), page.getByRole("checkbox").nth(1)];
    await expect(age).toContainText("I’m 18 years of age or older.");
    await expect(data).toContainText("including about my sex life");
    await expect(page.getByText(/By continuing, you accept our/)).toBeVisible();
    const agree = page.getByRole("button", { name: /i agree/i });
    await expect(agree).toBeDisabled();
    await age.click();
    await data.locator("div").first().click();
    await agree.click();

    await expect(
      page.getByRole("heading", { name: SCREENS[0]!.question, exact: true })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("asks its 61 screens in Mark's order, with the sheets, and submits the details page's answers", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await quietWrites(page);
    const submitted = await catchSubmit(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("loveiq-survey-consent", new Date().toISOString());
      window.sessionStorage.setItem("loveiq-survey-step", "6");
    });
    await instantScroll(page);
    await page.goto("/survey?order=survey2&sheets=all");
    // `next dev` only: its badge sits over the bottom-left corner and takes the taps there.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

    expect(SCREENS.map((q) => q.qId)).toHaveLength(61);
    // Which sheet opened after which screen.
    const opened: Array<[string, string]> = [];
    let answered = "";
    for (const [i, q] of SCREENS.entries()) {
      const heading = page.getByRole("heading", { name: q.question, exact: true });
      // A sheet after the last screen's question holds the move: read past it first.
      for (let tries = 0; !(await heading.isVisible().catch(() => false)); tries += 1) {
        const sheet = await pastSheet(page);
        if (sheet) opened.push([answered, sheet]);
        else await page.waitForTimeout(300);
        if (tries > 60) throw new Error(`screen ${i + 1} (${q.qId}) never appeared`);
      }
      if (q.qId === "00010") break;
      await answer(page, q);
      await next(page).click();
      answered = q.qId;
    }
    // Mark's spots. The Trustpilot sheet opens only where the site's Trustpilot numbers are set.
    expect(opened.filter(([, id]) => id !== "trustpilot")).toEqual([
      ["02004", "science"],
      ["03012", "expert"],
      ["14021", "halfway"],
      ["16005", "desire"],
      ["17002", "reportMap"],
    ]);
    for (const [after, id] of opened) if (id === "trustpilot") expect(after).toBe("03013");

    // The details page: one field at a time, each opened by Next. The newsletter switch opens
    // under the email, off, and the country only on the Next that leaves the email.
    await expect(page.getByRole("heading", { name: DETAILS })).toBeVisible();
    await page.getByLabel("Name or nickname").fill(NAME);
    await next(page).click();
    await page.getByLabel("Email", { exact: true }).fill(EMAIL);
    const optIn = page.getByRole("switch", { name: SWITCH });
    await expect(optIn).toHaveAttribute("aria-checked", "false");
    await expect(page.getByPlaceholder(/search for a country/i)).toHaveCount(0);
    // Left off, Next opens the "Sure you want to miss out?" sheet once: Not now keeps the No.
    await next(page).click();
    const missOut = page.getByRole("dialog", { name: "Sure you want to miss out?" });
    await expect(missOut).toBeVisible();
    await page.waitForTimeout(450);
    await missOut.getByRole("button", { name: "Not now" }).click();
    await expect(missOut).toBeHidden();
    await expect(optIn).toBeHidden(); // it goes with the email row (Mark's board 3)
    await page.getByPlaceholder(/search for a country/i).fill("Germany");
    await page.getByRole("option", { name: "Germany" }).first().click();
    await page.getByLabel(/^Postal code in Germany/).fill("101");
    await next(page).click();

    await expect.poll(() => submitted(), { timeout: 20_000 }).not.toBeNull();
    const body = submitted()!;
    const answers = body.answers as Record<string, unknown>;
    expect(body).toMatchObject({ email: EMAIL, firstName: NAME });
    expect(answers).toMatchObject({
      "00001": NAME,
      "00000": EMAIL,
      "15001": "Germany",
      "15002": "101",
      "17001": 4,
      "17002": 4,
    });
    expect(String(answers["16015"]).toLowerCase()).toMatch(/^no/);
    expect(answers["17003"]).toBeTruthy();
    // Its own two screens are never submitted, and 16009 is not asked.
    expect(answers).not.toHaveProperty("16016a");
    expect(answers).not.toHaveProperty("00010");
    expect(answers).not.toHaveProperty("16009");
  });
});
