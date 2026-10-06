import { test, expect } from "@playwright/test";

import { surveyQuestions } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { orderAskedQuestions, orderEmailLast } from "../features/survey/ui/questionOrder";
import { pinSurveySession } from "./surveyArm";

/**
 * The question screen's layout (Figma 11303:174, 2026-10-04).
 *
 * The card used to keep the frame's fixed 640px height, so a short question left a
 * dead gap above the buttons, and the page had empty space below the card. It now
 * hugs its content and is placed once per question. Two things pin that:
 *
 *   - picking an answer moves nothing (the placement is held, the card grows down)
 *   - from 640px wide, the buttons follow the last guidance row, no dead gap
 *
 * And since the 2026-10-06 update (one footer row with its own hairline): on a phone, a
 * question longer than the screen ends clear of that line, and from 640px the bar
 * starts where the frame puts it, whatever the count beside it says.
 *
 * Nothing is written: every survey write is answered locally.
 */

const ASKED = orderEmailLast(surveyQuestions).filter((q) => !isHidden(q.qId));
const SCALE_INDEX = ASKED.findIndex((q) => q.answerType === "scale");
// The order a session pinned to control sees (see e2e/surveyArm.ts).
const CONTROL = orderAskedQuestions(surveyQuestions, "control").filter((q) => !isHidden(q.qId));

test.describe("Survey — question layout", () => {
  test("picking an answer moves nothing, and no dead gap above the buttons", async ({ page }) => {
    for (const p of ["**/api/survey", "**/api/survey-partial", "**/api/survey-tracking"]) {
      await page.route(p, (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: "{}" })
      );
    }
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
    }, SCALE_INDEX);
    await page.goto("/survey");
    await expect(
      page.getByRole("heading", { name: ASKED[SCALE_INDEX]!.question, exact: true })
    ).toBeVisible({ timeout: 15_000 });
    // The entrance animation must have finished, or "before" is read mid-flight.
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity
        )
    );

    const point = page.getByRole("button", { name: "5 of 7" });
    const before = (await point.boundingBox())!;
    await point.click();
    await expect(point).toHaveAttribute("aria-pressed", "true");
    const after = (await point.boundingBox())!;
    expect(Math.abs(after.y - before.y), "the picked point moved").toBeLessThan(1);

    if (page.viewportSize()!.width >= 640) {
      const row = (await page.getByRole("button", { name: "Why we ask this" }).boundingBox())!;
      const next = (await page.getByRole("button", { name: "Next", exact: true }).boundingBox())!;
      expect(next.y - (row.y + row.height), "dead gap above the buttons").toBeLessThan(60);
    }
  });

  test("on a phone, a long question ends clear of the footer's line", async ({ page }) => {
    for (const p of ["**/api/survey", "**/api/survey-partial", "**/api/survey-tracking"]) {
      await page.route(p, (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: "{}" })
      );
    }
    // The first multiple-choice question: on an iPhone SE its options run past the
    // screen, so at the scroll end the question meets the sticky footer row.
    const index = CONTROL.findIndex((q) => q.answerType === "multiple");
    await pinSurveySession(page, "control");
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript((i) => {
      const state = {
        answers: {},
        currentIndex: i,
        startedAt: new Date().toISOString(),
        prefilled: [],
      };
      window.localStorage.setItem("loveiq-survey-answers", JSON.stringify(state));
      window.localStorage.setItem("loveiq-survey-consent", new Date().toISOString());
      window.sessionStorage.setItem("loveiq-survey-step", "6");
    }, index);
    await page.goto("/survey");
    await expect(
      page.getByRole("heading", { name: CONTROL[index]!.question, exact: true })
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity
        )
    );
    const overflows = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight
    );
    expect(overflows, "the question must be longer than the screen to test this").toBe(true);

    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Math.ceil(window.scrollY + window.innerHeight) >=
            document.documentElement.scrollHeight - 1
        )
      )
      .toBe(true);

    const why = (await page.getByRole("button", { name: "Why we ask this" }).boundingBox())!;
    const line = (await page.locator("main nav").boundingBox())!;
    expect(
      line.y - (why.y + why.height),
      "the footer's line runs under the last line of the question"
    ).toBeGreaterThanOrEqual(8);
  });

  test("from 640px, the bar starts in the same place whatever the count says", async ({
    context,
  }) => {
    // Figma draws the count in a fixed 104px box (node 11303:267), so the bar never
    // moves. The narrowest count (1/62 · ~15 MIN) against the widest (22/62 · ~10 MIN).
    const measure = async (index: number) => {
      const page = await context.newPage();
      for (const p of ["**/api/survey", "**/api/survey-partial", "**/api/survey-tracking"]) {
        await page.route(p, (r) =>
          r.fulfill({ status: 200, contentType: "application/json", body: "{}" })
        );
      }
      await pinSurveySession(page, "control");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.addInitScript((i) => {
        const state = {
          answers: {},
          currentIndex: i,
          startedAt: new Date().toISOString(),
          prefilled: [],
        };
        window.localStorage.setItem("loveiq-survey-answers", JSON.stringify(state));
        window.localStorage.setItem("loveiq-survey-consent", new Date().toISOString());
        window.sessionStorage.setItem("loveiq-survey-step", "6");
      }, index);
      await page.goto("/survey");
      const bar = page.getByRole("progressbar", { name: "Survey progress" });
      await expect(bar).toHaveAttribute(
        "aria-valuetext",
        `Question ${index + 1} of ${CONTROL.length}`,
        { timeout: 15_000 }
      );
      const nav = (await page.locator("main nav").boundingBox())!;
      const box = (await bar.boundingBox())!;
      // The label is the count, the divider between it and the time left, then the time.
      const label = await bar.evaluate((el) => {
        const [, divider, time] = el.parentElement!.firstElementChild!.children;
        return {
          textEnd: time!.getBoundingClientRect().right,
          divider: divider!.getBoundingClientRect().width,
        };
      });
      await page.close();
      return { start: box.x - nav.x, clear: box.x - label.textEnd, divider: label.divider };
    };
    const narrow = await measure(0);
    const wide = await measure(21);
    expect(Math.abs(wide.start - narrow.start), "the bar moved with the count").toBeLessThan(0.5);
    expect(wide.clear, "the widest count runs into the bar").toBeGreaterThanOrEqual(4);
    expect(wide.divider, "the widest count squeezed its divider away").toBeGreaterThanOrEqual(0.9);
  });
});
