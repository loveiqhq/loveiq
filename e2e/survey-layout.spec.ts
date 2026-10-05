import { test, expect } from "@playwright/test";

import { surveyQuestions } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { orderEmailLast } from "../features/survey/ui/questionOrder";

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
 * Nothing is written: every survey write is answered locally.
 */

const ASKED = orderEmailLast(surveyQuestions).filter((q) => !isHidden(q.qId));
const SCALE_INDEX = ASKED.findIndex((q) => q.answerType === "scale");

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
});
