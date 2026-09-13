import { test, expect, type Page } from "@playwright/test";

import { surveyQuestions, type SurveyQuestion } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { orderEmailLast } from "../features/survey/ui/questionOrder";

/**
 * The last question's answer must survive into the submit payload.
 *
 * `goNext` closes over `answers`. On the final question the respondent picks an option
 * and clicks Next moments later, and if that second click lands before React has
 * committed the first, the submit posts the answer map WITHOUT the last answer. Nothing
 * errors — the payload is just short one key, and `submit_survey` writes 56 rows instead
 * of 57.
 *
 * Production, 2026-09-11: 202 of 1,764 completed submissions over 120 days (11.5%) had no
 * row for 16015, the marketing opt-in, which is the last question asked. `marketing_opt_in`
 * was NULL for exactly those 202. Of the 20 whose draft outlived the submission, all 20
 * held the answer client-side and 11 said "Yes" — consent given, never recorded.
 *
 * The trigger is AUTO-ADVANCE, which is off by default but persists in localStorage once
 * a respondent turns it on. With it on, choosing an option schedules `goNext()` on a
 * 350ms timer — and that scheduled callback is the `goNext` from the render BEFORE the
 * answer existed. On the last question that timer is the submit. With auto-advance off
 * the submit is a Next click, which cannot fire early because the button stays disabled
 * until the answer commits — which is why this only bites the fast path.
 *
 * Nothing is written: the submit POST is intercepted and inspected, never forwarded.
 */

const ASKED: SurveyQuestion[] = orderEmailLast(surveyQuestions).filter((q) => !isHidden(q.qId));
const LAST = ASKED[ASKED.length - 1]!;

test("the final answer reaches the submit payload even when Next is clicked instantly", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(240_000);

  let payload: { answers?: Record<string, unknown> } | null = null;
  for (const p of ["**/api/survey-partial", "**/api/survey-tracking", "**/api/analytics-event"]) {
    await page.route(p, (r) => r.fulfill({ status: 200, body: "{}" }));
  }
  await page.route("**/api/survey", async (route) => {
    payload = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, reportToken: "stub", submissionId: 1 }),
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("loveiq-survey-autoadvance", "true");
  });

  await page.goto("/survey");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  await page
    .getByRole("button", { name: /continue/i })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /quality in → magic out/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /skip intro/i }).click();
  await page.getByRole("checkbox").first().click();
  await page.getByRole("checkbox").nth(1).locator("div").first().click();
  await page.getByRole("button", { name: /i agree/i }).click();

  for (let i = 0; i < ASKED.length; i += 1) {
    const q = ASKED[i]!;
    const nextQ = ASKED[i + 1] ?? null;
    await expect(page.getByRole("heading", { name: q.question, exact: true })).toBeVisible({
      timeout: 15_000,
    });

    if (!nextQ) break; // the last question is handled below

    let needsNext = false;
    switch (q.answerType) {
      case "open": {
        const v = q.qId === "00000" ? "last-answer-guard@loveiq.org" : "Guard";
        const boxes = page.getByRole("textbox");
        for (let b = 0, n = await boxes.count(); b < n; b += 1) await boxes.nth(b).fill(v);
        needsNext = true;
        break;
      }
      case "scale":
        await page.getByRole("button", { name: "4 of 7" }).click();
        break;
      case "single":
        await page.getByRole("radio").first().click();
        break;
      case "multiple":
        await page.getByRole("checkbox").first().click();
        needsNext = true;
        break;
      case "country":
        await page.getByPlaceholder(/search for a country/i).fill("Germany");
        await page.getByRole("option").first().click();
        break;
    }

    const next = page.getByRole("heading", { name: nextQ.question, exact: true });
    if (needsNext) {
      await page.getByRole("button", { name: /next/i }).click();
      await next.waitFor({ state: "visible", timeout: 12_000 });
    } else {
      try {
        await next.waitFor({ state: "visible", timeout: 1500 });
      } catch {
        await page.getByRole("button", { name: /next/i }).click();
        await next.waitFor({ state: "visible", timeout: 12_000 });
      }
    }
  }

  // Answer the last question and let auto-advance submit it. No Next click.
  await page.getByRole("radio").first().click();

  await expect
    .poll(() => payload !== null, { timeout: 30_000, message: "the survey must submit" })
    .toBe(true);

  const answers = payload!.answers ?? {};
  expect(
    Object.keys(answers),
    `${LAST.qId} (${LAST.question}) must be in the submitted payload`
  ).toContain(LAST.qId);
  expect(Object.keys(answers).length).toBe(ASKED.length);
});
