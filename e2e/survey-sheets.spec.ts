import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { surveyQuestions } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { orderAskedQuestions } from "../features/survey/ui/questionOrder";
import { SCIENCE_SHARES } from "../features/survey/surveySheetsCopy";
import { pinSurveySession } from "./surveyArm";

/**
 * The sheets between questions (Mark's "Survey & Report Components", 11 Nov 2026) in a real
 * browser, through the `?sheets=all` preview (the production build allows it only where the
 * test server sets SURVEY_SHEETS_PREVIEW=1, see playwright.config.ts): each opens at its
 * question with the board's words and shape, Keep going carries on, it opens once per run,
 * its motion is finished within a second and is absent under reduced motion, and axe finds
 * nothing on it.
 *
 * The C13 test order (`variant`), where Mark's question numbers come from. Nothing is
 * written: every survey write is answered locally.
 *
 * SHEETS_SHOTS_DIR=<dir> also saves each sheet at rest, for the side-by-side with the boards.
 */

const ARM = "variant" as const;
const ASKED = orderAskedQuestions(surveyQuestions, ARM).filter((q) => !isHidden(q.qId));
type Question = (typeof ASKED)[number];

function indexOf(qId: string): number {
  const i = ASKED.findIndex((q) => q.qId === qId);
  if (i < 0) throw new Error(`${qId} is not asked in the ${ARM} order`);
  return i;
}

/** An answer each question type takes, so Next moves on. */
function answerFor(q: Question): unknown {
  if (q.answerType === "scale") return 4;
  if (q.answerType === "multiple") return [q.options?.[0] ?? "e2e"];
  if (q.answerType === "single") return q.options?.[0] ?? "e2e";
  return q.inputType === "email" ? "e2e-sheets@loveiq.org" : "e2e";
}

const RESPOND = "The other person starts things — I respond to them";

/** A run resumed on the question at `index`, answered (with `answer` if given). */
async function onQuestion(page: Page, index: number, answer?: unknown): Promise<void> {
  for (const p of [
    "**/api/survey-partial",
    "**/api/survey-tracking",
    "**/api/analytics-event",
    "**/api/funnel-event",
  ]) {
    await page.route(p, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );
  }
  await pinSurveySession(page, ARM);
  const q = ASKED[index]!;
  await page.addInitScript(
    ({ index: at, qId, value, arm }) => {
      const state = {
        answers: { [qId]: value },
        currentIndex: at,
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: arm,
      };
      window.localStorage.setItem("loveiq-survey-answers", JSON.stringify(state));
      window.localStorage.setItem("loveiq-survey-consent", new Date().toISOString());
      window.sessionStorage.setItem("loveiq-survey-step", "6");
    },
    { index, qId: q.qId, value: answer ?? answerFor(q), arm: ARM }
  );
  await page.goto("/survey?sheets=all");
  await expect(page.getByRole("heading", { name: q.question, exact: true })).toBeVisible({
    timeout: 20_000,
  });
  // `next dev` only: its badge sits over the bottom-left corner and takes the taps there.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
}

const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true });
const keepGoing = (page: Page) => page.getByRole("button", { name: "Keep going", exact: true });
const sheetRoot = (page: Page, id: string) => page.locator(`[data-survey-sheet="${id}"]`);
/** A sheet ignores taps for its first 400 ms (OPEN_GUARD_MS). */
const settle = (page: Page) => page.waitForTimeout(450);

/** Every animation inside the sheet: none endless, each done within `budget` ms. */
async function sheetAnimations(page: Page, id: string) {
  return page.evaluate((sheetId) => {
    const root = document.querySelector(`[data-survey-sheet="${sheetId}"]`);
    return document
      .getAnimations()
      .filter((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return !!(root && target instanceof Element && root.contains(target));
      })
      .map((a) => {
        const t = a.effect?.getComputedTiming();
        return {
          name: (a as CSSAnimation).animationName ?? "",
          end: Number(t?.endTime ?? 0),
          iterations: Number(t?.iterations ?? 1),
        };
      });
  }, id);
}

async function saveShot(page: Page, name: string) {
  const dir = process.env.SHEETS_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(dir, `${name}-${test.info().project.name}.png`) });
}

test.describe("Survey: the sheets between questions", () => {
  test("science: the reader's own share, counting up, then on to the next question", async ({
    page,
  }) => {
    const at = indexOf("02004");
    await onQuestion(page, at, RESPOND);
    await next(page).click();
    const dialog = page.getByRole("dialog", {
      name: `Like ${SCIENCE_SHARES.respond}% of people, you love to respond.`,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "say their best sex starts when the other person makes the first move."
    );
    // The motion budget: nothing endless, everything done by 900ms after the 450ms rise.
    for (const a of await sheetAnimations(page, "science")) {
      expect(a.iterations, a.name).not.toBe(Infinity);
      expect(a.end, a.name).toBeLessThanOrEqual(1000);
    }
    // Flush with the bottom edge, at most 480px wide from 640px (Fatih, 10 Nov).
    await page.waitForTimeout(700);
    const viewport = page.viewportSize()!;
    const panel = sheetRoot(page, "science").getByRole("dialog");
    const box = (await panel.boundingBox())!;
    expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(1);
    if (viewport.width >= 640) expect(box.width).toBeLessThanOrEqual(480);
    await expect(dialog.locator("[data-count-up]")).toHaveText(`${SCIENCE_SHARES.respond}%`);
    await saveShot(page, "1-science");

    await keepGoing(page).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("heading", { name: ASKED[at + 1]!.question, exact: true })
    ).toBeVisible();
  });

  test("science: opens once per run; back on its question, Next just moves on", async ({
    page,
  }) => {
    const at = indexOf("02004");
    await onQuestion(page, at, RESPOND);
    await next(page).click();
    await settle(page);
    await keepGoing(page).click();
    await expect(
      page.getByRole("heading", { name: ASKED[at + 1]!.question, exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "Previous" }).click();
    await expect(
      page.getByRole("heading", { name: ASKED[at]!.question, exact: true })
    ).toBeVisible();
    await next(page).click();
    await expect(
      page.getByRole("heading", { name: ASKED[at + 1]!.question, exact: true })
    ).toBeVisible();
    await expect(sheetRoot(page, "science")).toHaveCount(0);
  });

  test("trustpilot: the TrustScore and one real review, static stars", async ({ page }) => {
    const at = indexOf("03008");
    await onQuestion(page, at);
    await next(page).click();
    const root = sheetRoot(page, "trustpilot");
    // Shown only where the site's Trustpilot switch and numbers are set.
    if ((await root.count()) === 0) {
      await expect(
        page.getByRole("heading", { name: ASKED[at + 1]!.question, exact: true })
      ).toBeVisible();
      return;
    }
    await expect(root.getByRole("dialog")).toBeVisible();
    await expect(root).toContainText("TrustScore");
    await expect(root).toContainText("Very interesting report, and personalised");
    await saveShot(page, "2-trustpilot");
    await settle(page);
    await keepGoing(page).click();
    await expect(
      page.getByRole("heading", { name: ASKED[at + 1]!.question, exact: true })
    ).toBeVisible();
  });

  test("expert: rises over 01005 as it arrives, and leaves the reader there", async ({ page }) => {
    const target = indexOf("01005");
    await onQuestion(page, target - 1);
    await next(page).click();
    const dialog = page.getByRole("dialog", { name: "Dr. Dijana Galijašević" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("all the dots connected");
    await saveShot(page, "3-expert");
    await settle(page);
    await keepGoing(page).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("heading", { name: ASKED[target]!.question, exact: true })
    ).toBeVisible();
  });

  test("halfway: the check draws itself; minutes as the strip counts them", async ({ page }) => {
    const at = indexOf("11003");
    await onQuestion(page, at);
    await next(page).click();
    const root = sheetRoot(page, "halfway");
    await expect(root.getByRole("dialog")).toBeVisible();
    await expect(root.getByRole("img", { name: "First half done" })).toBeVisible();
    await expect(root).toContainText("Your highest scored sexual personality and its motivation.");
    await expect(root).toContainText(/Only ~\d+ more minutes\./);
    await saveShot(page, "4-halfway");
    await settle(page);
    await keepGoing(page).click();
    await expect(
      page.getByRole("heading", { name: ASKED[at + 1]!.question, exact: true })
    ).toBeVisible();
  });

  test("State of Desire: the box starts unticked and ticks on a tap", async ({ page }) => {
    const at = indexOf("16005");
    await onQuestion(page, at);
    await next(page).click();
    const root = sheetRoot(page, "desire");
    await expect(root.getByRole("dialog")).toBeVisible();
    const box = root.getByRole("checkbox");
    await expect(box).not.toBeChecked();
    await saveShot(page, "5-desire");
    await settle(page);
    await root.locator("label").click();
    await expect(box).toBeChecked();
    await keepGoing(page).click();
    await expect(
      page.getByRole("heading", { name: ASKED[at + 1]!.question, exact: true })
    ).toBeVisible();
  });

  test("report map: three questions left, the report's own 17 chapters", async ({ page }) => {
    const at = ASKED.length - 4;
    await onQuestion(page, at);
    await next(page).click();
    const root = sheetRoot(page, "reportMap");
    await expect(root.getByRole("dialog")).toBeVisible();
    await expect(root).toContainText("3 questions left");
    await expect(root).toContainText("6 Parts,");
    await expect(root).toContainText("17 Chapters");
    await saveShot(page, "6-report-map");
    await settle(page);
    // Previous: back to the question on screen.
    await root.getByRole("button", { name: "Previous" }).click();
    await expect(root.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: ASKED[at]!.question, exact: true })
    ).toBeVisible();
  });

  test("under reduced motion nothing moves, the numbers stand, and axe finds nothing", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await onQuestion(page, indexOf("02004"), RESPOND);
    await next(page).click();
    const dialog = sheetRoot(page, "science").getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await sheetAnimations(page, "science")).toEqual([]);
    await expect(dialog.locator("[data-count-up]")).toHaveText(`${SCIENCE_SHARES.respond}%`);
    const results = await new AxeBuilder({ page })
      .include('[data-survey-sheet="science"]')
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
