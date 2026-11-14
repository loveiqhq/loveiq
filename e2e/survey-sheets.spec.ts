import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
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

/** Each element's CSS animation-delay in ms, in document order (0 under reduced motion). */
async function animationDelays(elements: Locator) {
  return elements.evaluateAll((els) =>
    els.map((el) => Number.parseFloat(getComputedStyle(el).animationDelay) * 1000)
  );
}

async function saveShot(page: Page, name: string) {
  const dir = process.env.SHEETS_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(dir, `${name}-${test.info().project.name}.png`) });
}

test.describe("Survey: the sheets between questions", () => {
  test("science: Mark's message, the share counting up, then on to the next question", async ({
    page,
  }) => {
    const at = indexOf("02004");
    await onQuestion(page, at, RESPOND);
    await next(page).click();
    const dialog = page.getByRole("dialog", {
      name: "More people love to respond",
    });
    await expect(dialog).toBeVisible();
    // The 12% counts up too since Mark's second review (13 Nov): its digits are checked below.
    await expect(dialog).toContainText(
      "say their best sex starts when the other person makes the first move. Only"
    );
    await expect(dialog).toContainText("say it’s when they start.");
    // The motion budget: nothing endless, the CSS done by 900ms after the 450ms rise (the
    // numbers count up in script, over 1.2s from 400ms: Mark's "more slowly", 12 Nov; the 12%
    // follows once the 36% is halfway: his second review, 13 Nov).
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
    await expect(dialog.locator("[data-count-up]")).toHaveText([
      `${SCIENCE_SHARES.respond}%`,
      `${SCIENCE_SHARES.start}%`,
    ]);
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

  test("trustpilot: the TrustScore, the stars arriving in turn, one real review", async ({
    page,
  }) => {
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
    // "Excellent", then the five stars one after another (Mark's review, 12 Nov).
    const starDelays = await animationDelays(root.locator("[data-tp-star]"));
    expect(starDelays).toHaveLength(5);
    for (let i = 1; i < starDelays.length; i++) {
      expect(starDelays[i]! - starDelays[i - 1]!).toBeGreaterThanOrEqual(100);
    }
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

  test("halfway: the steps arrive one after another; minutes as the strip counts them", async ({
    page,
  }) => {
    const at = indexOf("11003");
    await onQuestion(page, at);
    await next(page).click();
    const root = sheetRoot(page, "halfway");
    await expect(root.getByRole("dialog")).toBeVisible();
    await expect(root).toContainText("Your Core Archetype is taking shape.");
    await expect(root.getByRole("img", { name: "First half done" })).toHaveCount(0);
    // One after another, at least 250ms apart (Mark's review, 12 Nov), at 1.5x since his second
    // review (13 Nov: "everything a bit slower"), so all settled by 2.3s.
    const stepDelays = await animationDelays(root.locator("[data-halfway-step]"));
    expect(stepDelays).toHaveLength(3);
    expect(stepDelays[1]! - stepDelays[0]!).toBeGreaterThanOrEqual(400);
    expect(stepDelays[2]! - stepDelays[1]!).toBeGreaterThanOrEqual(400);
    for (const a of await sheetAnimations(page, "halfway")) {
      expect(a.end, a.name).toBeLessThanOrEqual(2300);
    }
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
    await expect(root.locator("label")).toContainText("Email me a 5€ off code.");
    // From 640px the line fits: no break before "5€ off" (Mark's review, 12 Nov).
    if (page.viewportSize()!.width >= 640) {
      const text = (await root.locator("label > span").last().boundingBox())!;
      expect(text.height).toBeLessThan(30);
    }
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
    await expect(root).toContainText(
      /your Light Report\s*also opening part of each featured chapter\./
    );
    // Readable on a desktop: drawn 238px wide from 640px, 156px on a phone (Mark, 12 Nov).
    const map = (await root.locator("[data-report-map] > div").boundingBox())!;
    if (page.viewportSize()!.width >= 640) expect(map.width).toBeGreaterThanOrEqual(230);
    else expect(map.width).toBeLessThan(160);
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
    await expect(dialog.locator("[data-count-up]")).toHaveText([
      `${SCIENCE_SHARES.respond}%`,
      `${SCIENCE_SHARES.start}%`,
    ]);
    const results = await new AxeBuilder({ page })
      .include('[data-survey-sheet="science"]')
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
