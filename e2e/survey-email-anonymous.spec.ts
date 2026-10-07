import { test, expect, type Page } from "@playwright/test";

import { surveyQuestions } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { EMAIL_QID, orderAskedQuestions } from "../features/survey/ui/questionOrder";
import type { EmailQuestionArm } from "../shared/experiments/emailQuestionArm";
import { pinSurveySession } from "./surveyArm";

/**
 * The email question test (shared/experiments/emailQuestionArm.ts): today's question
 * against Marcus's anonymous redesign, Figma IdxyUUVvJSYRTpI9CYRtJI 11600:15119.
 *
 * `?email=` previews are off in a production build (see e2e/surveyArm.ts), so each arm is
 * reached through a session id that hashes to it. Both open in C13's control order.
 * Nothing is written: every survey write is answered locally.
 */

const CONTROL = orderAskedQuestions(surveyQuestions, "control").filter((q) => !isHidden(q.qId));
const EMAIL_INDEX = CONTROL.findIndex((q) => q.qId === EMAIL_QID);
const TODAY = CONTROL[EMAIL_INDEX]!;
const AFTER = CONTROL[EMAIL_INDEX + 1]!;
const ANONYMOUS_TITLE = "What’s your email? Feel free to use an anonymous one.";
const ADDRESS = "e2e-no-submit@loveiq.org";

async function openEmailQuestion(page: Page, email: EmailQuestionArm) {
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
  await pinSurveySession(page, "control", email);
  await page.addInitScript((index) => {
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
  }, EMAIL_INDEX);
  await page.goto("/survey");
}

test.describe("Survey — the email question test", () => {
  test("the anonymous arm asks the redesigned question, in one field", async ({ page }) => {
    await openEmailQuestion(page, "anonymous");
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
    await expect(page.getByRole("heading", { name: AFTER.question, exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("the control arm keeps today's question and its confirm box", async ({ page }) => {
    await openEmailQuestion(page, "control");
    await expect(page.getByRole("heading", { name: TODAY.question, exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("textbox")).toHaveCount(2);

    const next = page.getByRole("button", { name: "Next", exact: true });
    await page.getByRole("textbox", { name: TODAY.question, exact: true }).fill(ADDRESS);
    await expect(next).toBeDisabled();
    await page.getByRole("textbox", { name: "Confirm email address" }).fill(ADDRESS);
    await expect(next).toBeEnabled();
  });

  test("the field is drawn to the frame", async ({ page }) => {
    await openEmailQuestion(page, "anonymous");
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
    await openEmailQuestion(page, "anonymous");
    const field = page.getByRole("textbox");
    await expect(field).toBeVisible({ timeout: 15_000 });
    const box = (await field.boundingBox())!;
    const column = (await field.locator("..").boundingBox())!;
    expect(box.x + box.width, "the field's right edge").toBeLessThanOrEqual(
      column.x + column.width + 0.5
    );
  });
});
