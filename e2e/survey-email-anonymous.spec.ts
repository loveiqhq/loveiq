import { test, expect, type Page } from "@playwright/test";

import { surveyQuestions } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { EMAIL_QID, orderAskedQuestions } from "../features/survey/ui/questionOrder";
import type { QuestionOrderArm } from "../shared/experiments/questionOrderArm";
import { pinSurveySession } from "./surveyArm";

/**
 * The email question (shared/experiments/emailQuestionArm.ts): Marcus's anonymous redesign,
 * Figma IdxyUUVvJSYRTpI9CYRtJI 11600:15119, won its test against the question before it and
 * is asked of every free run since 4 Nov 2026, whatever arm its session id drew while the
 * test ran. A buyer who paid first keeps the old question and its confirm box; that needs a
 * paid purchase in the database, so SurveyEngine's unit tests cover it, not this spec.
 *
 * Both opening orders are pinned, each with a session id that drew the test's control arm.
 * Nothing is written: every survey write is answered locally.
 */

const asked = (order: QuestionOrderArm) =>
  orderAskedQuestions(surveyQuestions, order).filter((q) => !isHidden(q.qId));
const ANONYMOUS_TITLE = "What’s your email? Feel free to use an anonymous one.";
const ADDRESS = "e2e-no-submit@loveiq.org";

async function openEmailQuestion(page: Page, order: QuestionOrderArm = "control") {
  for (const p of [
    "**/api/survey",
    "**/api/survey-partial",
    "**/api/survey-tracking",
    "**/api/analytics-event",
  ]) {
    await page.route(p, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );
  }
  await pinSurveySession(page, order);
  await page.addInitScript(
    (index) => {
      const state = {
        answers: {},
        currentIndex: index,
        startedAt: new Date().toISOString(),
        prefilled: [],
      };
      window.localStorage.setItem("loveiq-survey-answers", JSON.stringify(state));
      // A reader who already agreed on the consent screen; without it /survey opens there.
      window.localStorage.setItem("loveiq-survey-consent", new Date().toISOString());
      window.sessionStorage.setItem("loveiq-survey-step", "6");
    },
    asked(order).findIndex((q) => q.qId === EMAIL_QID)
  );
  await page.goto("/survey");
}

test.describe("Survey — the email question", () => {
  for (const order of ["control", "variant"] as const) {
    test(`asks the anonymous question, in one field (${order} opening)`, async ({ page }) => {
      const questions = asked(order);
      const after = questions[questions.findIndex((q) => q.qId === EMAIL_QID) + 1]!;
      await openEmailQuestion(page, order);
      await expect(page.getByRole("heading", { name: ANONYMOUS_TITLE, exact: true })).toBeVisible({
        timeout: 15_000,
      });
      const field = page.getByRole("textbox");
      await expect(field).toHaveCount(1);
      await expect(field).toHaveAttribute("placeholder", "e.g. nickname@example.com");
      await expect(page.getByRole("textbox", { name: "Confirm email address" })).toHaveCount(0);

      // No confirm box to match: a valid address is enough to go on.
      const next = page.getByRole("button", { name: "Next", exact: true });
      await expect(next).toBeDisabled();
      await field.fill(ADDRESS);
      await expect(next).toBeEnabled();
      await next.click();
      await expect(page.getByRole("heading", { name: after.question, exact: true })).toBeVisible({
        timeout: 15_000,
      });
    });
  }

  test("the field is drawn to the frame", async ({ page }) => {
    await openEmailQuestion(page);
    const field = page.getByRole("textbox");
    await expect(field).toBeVisible({ timeout: 15_000 });
    // The entrance animation must have finished, or the boxes are read mid-flight.
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity
        )
    );

    const box = (await field.boundingBox())!;
    expect(box.height, "the field's height").toBeCloseTo(48, 1);
    if (page.viewportSize()!.width >= 640) {
      expect(box.width, "the field's width from 640px").toBeCloseTo(523.5, 1);
    } else {
      const column = (await field.locator("..").boundingBox())!;
      expect(box.width, "the field fills the column on a phone").toBeCloseTo(column.width, 1);
    }

    // The Why row's hairline sits 20px under the field's line, as drawn.
    const why = page.getByRole("button", { name: "Why we ask this" }).locator("..");
    const row = (await why.boundingBox())!;
    expect(row.y - (box.y + box.height), "the gap above the Why row").toBeCloseTo(20, 1);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflows, "the page scrolls sideways").toBe(false);
  });

  test("just past 640px, the field keeps inside its column", async ({ page }) => {
    // At 641px the column is about 521px wide, under the frame's 523.5.
    await page.setViewportSize({ width: 641, height: 900 });
    await openEmailQuestion(page);
    const field = page.getByRole("textbox");
    await expect(field).toBeVisible({ timeout: 15_000 });
    const box = (await field.boundingBox())!;
    const column = (await field.locator("..").boundingBox())!;
    expect(box.x + box.width, "the field's right edge").toBeLessThanOrEqual(
      column.x + column.width + 0.5
    );
  });
});
