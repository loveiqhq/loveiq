import { test, expect, type Page } from "@playwright/test";

import { surveyQuestions, type SurveyQuestion } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { C13_OPENING, orderAskedQuestions } from "../features/survey/ui/questionOrder";
import { pinSurveySession } from "./surveyArm";

/**
 * C13 — the variant opening, in a real browser.
 *
 * The unit suite proves `orderC13Opening` returns the right array. It cannot prove the
 * ENGINE renders that array: the arm is resolved from the session id on first render, the
 * reorder is composed inside a `useMemo` with its own dependency list, and filters run
 * afterwards. A wrong dependency, a filter applied in the wrong order, or an arm read
 * before storage is ready would all leave the unit tests green and ship the control
 * opening to every respondent — which reads as "the experiment found no difference".
 *
 * Only the first eight questions are walked. That is the entire variant, and it keeps
 * this spec to seconds where the full survey walk takes minutes.
 *
 * NOTHING IS WRITTEN. Staging and production share one Supabase database, so every write
 * endpoint is intercepted and answered locally.
 */

const OPENING: SurveyQuestion[] = orderAskedQuestions(surveyQuestions, "variant")
  .filter((q) => !isHidden(q.qId))
  .slice(0, C13_OPENING.length);

const CONTROL_OPENING: SurveyQuestion[] = orderAskedQuestions(surveyQuestions, "control")
  .filter((q) => !isHidden(q.qId))
  .slice(0, C13_OPENING.length);

const WRITE_ROUTES = [
  "**/api/survey",
  "**/api/survey-partial",
  "**/api/survey-tracking",
  "**/api/analytics-event",
];

async function enterEngine(page: Page) {
  await page.goto("/survey");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page
    .getByRole("button", { name: /continue/i })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /skip intro/i }).click();
  await expect(page.getByRole("heading", { name: /before we begin/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("checkbox").first().click();
  await page.getByRole("checkbox").nth(1).locator("div").first().click();
  await page.getByRole("button", { name: /i agree/i }).click();
}

test.describe("Survey — C13 opening order", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the variant arm renders the promoted opening, and 01006 is not in it", async ({ page }) => {
    test.setTimeout(90_000);
    for (const pattern of WRITE_ROUTES) {
      await page.route(pattern, (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
      );
    }

    // The arms must actually differ, or walking one of them proves nothing. This is the
    // assertion that fails if C13 is ever reduced to a no-op — for instance by a spec
    // change that leaves `C13_OPENING` equal to the generated order.
    expect(
      OPENING.map((q) => q.qId),
      "the variant opening must differ from control, or this spec measures nothing"
    ).not.toEqual(CONTROL_OPENING.map((q) => q.qId));
    expect(CONTROL_OPENING.map((q) => q.qId)).toContain("01006");
    expect(
      OPENING.map((q) => q.qId),
      "01006 is the question C13 exists to demote — it must not open the variant"
    ).not.toContain("01006");

    const pinnedSessionId = await pinSurveySession(page, "variant");
    await enterEngine(page);

    const sessionId = await page.evaluate(() =>
      window.sessionStorage.getItem("loveiq-survey-session")
    );
    expect(sessionId, "the pinned session id is what puts this run in the variant arm").toBe(
      pinnedSessionId
    );

    for (let i = 0; i < OPENING.length; i += 1) {
      const q = OPENING[i]!;
      await expect(
        page.getByRole("heading", { name: q.question, exact: true }),
        `variant slot ${i + 1} must be ${q.qId}`
      ).toBeVisible({ timeout: 15_000 });

      if (i === OPENING.length - 1) break;
      const next = page.getByRole("heading", { name: OPENING[i + 1]!.question, exact: true });

      if (q.answerType === "open") {
        const boxes = page.getByRole("textbox");
        for (let b = 0, n = await boxes.count(); b < n; b += 1) await boxes.nth(b).fill("C13");
        await page.getByRole("button", { name: /next/i }).click();
      } else {
        // Every other question in the variant opening is a 1-7 scale, which may
        // auto-advance depending on the respondent's stored preference.
        await page.getByRole("button", { name: "4 of 7" }).click();
        try {
          await next.waitFor({ state: "visible", timeout: 1500 });
        } catch {
          await page.getByRole("button", { name: /next/i }).click();
        }
      }
      await next.waitFor({ state: "visible", timeout: 15_000 });
    }
  });
});
