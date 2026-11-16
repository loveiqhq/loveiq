import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { surveyQuestions } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { EMAIL_QID, OPT_IN_QID, orderAskedQuestions } from "../features/survey/ui/questionOrder";
import { pinSurveySession } from "./surveyArm";

/**
 * The marketing opt-in's "Sure you want to miss out?" sheet (Mark's Claude Design board
 * "Opt-in · B · Sample email sheet on Next", 10 Nov 2026), in a real browser: a No and Next
 * open it instead of submitting; its Yes submits the opt-in's own Yes, sent as given in the
 * sheet; Not now submits the No; Esc keeps the reader on the question. Its geometry is the
 * board's: flush with the bottom edge, 24px top corners, a 48px button.
 *
 * Nothing is written: every survey write is answered locally and inspected.
 */

const ARM = "control" as const;
const ASKED = orderAskedQuestions(surveyQuestions, ARM).filter((q) => !isHidden(q.qId));
const OPT_IN_INDEX = ASKED.findIndex((q) => q.qId === OPT_IN_QID);
const OPT_IN = ASKED[OPT_IN_INDEX]!;
const YES = "Yes, I want to keep learning about myself.";
const NO = "No, I am not interested in this growth opportunity.";
const TITLE = "Sure you want to miss out?";

if (OPT_IN_INDEX !== ASKED.length - 1) {
  throw new Error(`the marketing opt-in (${OPT_IN_QID}) is no longer the last question asked`);
}

type Payload = { answers?: Record<string, unknown>; marketingOptInVia?: unknown };

/** A run resumed on the opt-in with a No picked; returns what the submit would have sent. */
async function onTheOptInWithNo(page: Page): Promise<{ payload: () => Payload | null }> {
  let payload: Payload | null = null;
  for (const p of ["**/api/survey-partial", "**/api/survey-tracking", "**/api/analytics-event"]) {
    await page.route(p, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );
  }
  await page.route("**/api/survey", async (route) => {
    payload = JSON.parse(route.request().postData() ?? "{}") as Payload;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, reportToken: "stub", submissionId: 1 }),
    });
  });
  await pinSurveySession(page, ARM);
  await page.addInitScript(
    ({ index, email, emailQid, optInQid, no }) => {
      const state = {
        answers: { [emailQid]: email, [optInQid]: no },
        currentIndex: index,
        startedAt: new Date().toISOString(),
        prefilled: [],
      };
      window.localStorage.setItem("loveiq-survey-answers", JSON.stringify(state));
      window.localStorage.setItem("loveiq-survey-consent", new Date().toISOString());
      window.sessionStorage.setItem("loveiq-survey-step", "6");
    },
    {
      index: OPT_IN_INDEX,
      email: "e2e-optin-sheet@loveiq.org",
      emailQid: EMAIL_QID,
      optInQid: OPT_IN_QID,
      no: NO,
    }
  );
  await page.goto("/survey");
  await expect(page.getByRole("heading", { name: OPT_IN.question, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("radio", { name: NO })).toHaveAttribute("aria-checked", "true");
  return { payload: () => payload };
}

const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: TITLE });
/** The sheet ignores taps for its first 400 ms, so a double tap on Next cannot consent. */
const settle = (page: Page) => page.waitForTimeout(450);

test.describe("Survey: the opt-in's miss-out sheet", () => {
  test("a No and Next open it, with the board's words and shape, instead of submitting", async ({
    page,
  }) => {
    const run = await onTheOptInWithNo(page);
    await next(page).click();

    const dialog = sheet(page);
    await expect(dialog).toBeVisible();
    for (const line of [
      "Practical & scientific insights tailored to you",
      "Small practices to try the same day",
      "First access to new tests & guides",
      "No spam, just value. 95% of readers stay subscribed.",
    ]) {
      await expect(dialog).toContainText(line);
    }
    await expect(page.getByRole("button", { name: "Yes, I want to keep learning" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
    expect(run.payload()).toBeNull();

    // Let the slide finish, then measure it against the board.
    await page.waitForTimeout(600);
    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(1);
    if (viewport.width >= 640) {
      expect(box.width).toBeLessThanOrEqual(480);
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
    }
    const shape = await dialog.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderTopLeftRadius, top: s.borderTopWidth, bottom: s.borderBottomWidth };
    });
    expect(shape.radius).toBe("24px");
    expect(shape.bottom).toBe("0px");
    const yesBox = (await page
      .getByRole("button", { name: "Yes, I want to keep learning" })
      .boundingBox())!;
    expect(Math.round(yesBox.height)).toBe(48);
  });

  test("its Yes submits the opt-in's own Yes, sent as given in the sheet", async ({ page }) => {
    const run = await onTheOptInWithNo(page);
    await next(page).click();
    await expect(sheet(page)).toBeVisible();
    await settle(page);
    await page.getByRole("button", { name: "Yes, I want to keep learning" }).click();

    await expect.poll(() => run.payload() !== null, { timeout: 15_000 }).toBe(true);
    expect(run.payload()!.answers?.[OPT_IN_QID]).toBe(YES);
    expect(run.payload()!.marketingOptInVia).toBe("sheet");
  });

  test("Not now submits the No in one tap", async ({ page }) => {
    const run = await onTheOptInWithNo(page);
    await next(page).click();
    await expect(sheet(page)).toBeVisible();
    await settle(page);
    await page.getByRole("button", { name: "Not now" }).click();

    await expect.poll(() => run.payload() !== null, { timeout: 15_000 }).toBe(true);
    expect(run.payload()!.answers?.[OPT_IN_QID]).toBe(NO);
    expect(run.payload()).not.toHaveProperty("marketingOptInVia");
  });

  test("Esc keeps the reader on the question, and the next Next submits without it", async ({
    page,
  }) => {
    const run = await onTheOptInWithNo(page);
    await next(page).click();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole("heading", { name: OPT_IN.question, exact: true })).toBeVisible();
    expect(run.payload()).toBeNull();

    await next(page).click();
    await expect.poll(() => run.payload() !== null, { timeout: 15_000 }).toBe(true);
    expect(run.payload()!.answers?.[OPT_IN_QID]).toBe(NO);
    await expect(sheet(page)).toHaveCount(0);
  });

  test("has no critical accessibility violations while open", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await onTheOptInWithNo(page);
    await next(page).click();
    await expect(sheet(page)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .include("[data-optin-sheet]")
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(
      blocking,
      `Critical/serious a11y violations on the sheet: ${blocking.map((v) => `${v.id}: ${v.description}`).join("; ")}`
    ).toHaveLength(0);
  });
});
