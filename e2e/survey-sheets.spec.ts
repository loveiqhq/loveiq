import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { surveyQuestions } from "../data/survey-data";
import { isHidden } from "../features/survey/questionFlags";
import { orderAskedQuestions } from "../features/survey/ui/questionOrder";
import { SCIENCE_SHARES } from "../features/survey/surveySheetsCopy";
import { pinSurveySession } from "./surveyArm";
import type { GateRevealArm } from "../shared/experiments/gateRevealArm";

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

/**
 * A run resumed on the question at `index`, answered (with `answer` if given), in one half of
 * Mark's 50/50 of the new EUR 1.99 page (`gate`, the new page's unless named): the half decides
 * how the halfway sheet and the report map tell the offer (Mark, 16 Nov).
 */
async function onQuestion(
  page: Page,
  index: number,
  answer?: unknown,
  gate: GateRevealArm = "reveal"
): Promise<void> {
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
  await pinSurveySession(page, ARM, gate);
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
  // Sheet 4 (halfway) is out of the survey since 25 Nov 2026; named, the preview still shows it.
  await page.goto("/survey?sheets=all,halfway");
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

/** Each element's CSS animation delay and duration in ms, in document order. */
async function animationTimes(elements: Locator) {
  return elements.evaluateAll((els) =>
    els.map((el) => {
      const style = getComputedStyle(el);
      return {
        delay: Number.parseFloat(style.animationDelay) * 1000,
        duration: Number.parseFloat(style.animationDuration) * 1000,
      };
    })
  );
}

/**
 * Every finite animation in the sheet run to its end: axe then measures what the reader ends up
 * seeing, never a text still fading in (the #725 lesson on the EUR 1.99 page).
 */
async function animationsDone(root: Locator) {
  await root.evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished)
    )
  );
}

async function saveShot(page: Page, name: string) {
  const dir = process.env.SHEETS_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  // Every sheet has settled by 2.7s since Mark's third review (15 Nov): Trustpilot's quote last.
  await page.waitForTimeout(3000);
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
    // The motion budget: nothing endless, the CSS done by 1s, the sheet's own rise included (the
    // numbers count up in script, over 1.2s from 400ms: Mark's "more slowly", 12 Nov; the 12%
    // follows once the 36% is halfway: his second review, 13 Nov).
    for (const a of await sheetAnimations(page, "science")) {
      expect(a.iterations, a.name).not.toBe(Infinity);
      expect(a.end, a.name).toBeLessThanOrEqual(1000);
    }
    // Every sheet rises over 1s, so the reader sees it arrive (his third review, 15 Nov).
    const panel = sheetRoot(page, "science").getByRole("dialog");
    await expect(panel).toHaveCSS("animation-duration", "1s");
    // Flush with the bottom edge once it has risen, at most 480px wide from 640px (Fatih, 10 Nov).
    await panel.evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished));
    });
    const viewport = page.viewportSize()!;
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
    // The quote once every star has landed, fading in slower (Mark's third review, 15 Nov).
    const stars = await animationTimes(root.locator("[data-tp-star]"));
    const landed = Math.max(...stars.map((s) => s.delay + s.duration));
    const [quote] = await animationTimes(root.locator("[data-tp-quote]"));
    expect(quote!.delay).toBeGreaterThanOrEqual(landed);
    expect(quote!.duration).toBeGreaterThanOrEqual(700);
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
    // Slower again since Mark's third review (15 Nov: "Slow down all the animations"): the
    // screen fades in over 0.45s, and the six parts arrive over 100ms apart, each over 0.5s.
    await expect(root.getByRole("dialog")).toHaveCSS("animation-duration", "0.45s");
    const parts = await animationTimes(root.locator("[data-report-map] .sheet-in"));
    expect(parts).toHaveLength(6);
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i]!.delay - parts[i - 1]!.delay).toBeGreaterThanOrEqual(100);
    }
    for (const part of parts) expect(part.duration).toBeGreaterThanOrEqual(500);
    await saveShot(page, "6-report-map");
    await settle(page);
    // Previous: back to the question on screen.
    await root.getByRole("button", { name: "Previous" }).click();
    await expect(root.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: ASKED[at]!.question, exact: true })
    ).toBeVisible();
  });

  // Mark's write-up of his 50/50 (16 Nov): the half that meets today's EUR 1.99 page, which shows
  // no archetype, gets his versions of the halfway sheet and the map, with the Core Archetype in
  // the EUR 1.99 instead of free.
  test("halfway, today's page's half: one locked step sells the Core Archetype for €1.99", async ({
    page,
  }) => {
    const at = indexOf("11003");
    await onQuestion(page, at, undefined, "control");
    await next(page).click();
    const root = sheetRoot(page, "halfway");
    await expect(root.getByRole("dialog")).toBeVisible();
    await expect(root).toContainText("Your Core Archetype is taking shape.");
    await expect(root).toContainText("Unlock your Core Archetype for €1.99");
    await expect(root).toContainText("with a 14-day money-back guarantee");
    await expect(root.getByRole("img", { name: "Step 2, locked" })).toBeVisible();
    await expect(root.locator("[data-halfway-step]")).toHaveCount(2);
    await expect(root.getByText("Free", { exact: true })).toHaveCount(0);
    await expect(root).not.toContainText("Light Report");
    await saveShot(page, "4-halfway-today");
    await settle(page);
    await animationsDone(root);
    const results = await new AxeBuilder({ page })
      .include('[data-survey-sheet="halfway"]')
      .analyze();
    expect(results.violations).toEqual([]);
    await keepGoing(page).click();
    await expect(
      page.getByRole("heading", { name: ASKED[at + 1]!.question, exact: true })
    ).toBeVisible();
  });

  test("report map, today's page's half: the Core Archetype in the €1.99, and three reasons", async ({
    page,
  }) => {
    const at = ASKED.length - 4;
    await onQuestion(page, at, undefined, "control");
    await next(page).click();
    const root = sheetRoot(page, "reportMap");
    await expect(root.getByRole("dialog")).toBeVisible();
    const core = root.locator('[data-map-row-id="core_archetype"]');
    await expect(core).toHaveAttribute("data-map-row", "priced");
    await expect(core).toContainText("€1.99");
    await expect(root.locator('[data-map-row="free"]')).toHaveCount(0);
    await expect(root).not.toContainText("for free");
    await expect(root).toContainText(
      "Unlock your Core Archetype, and part of each featured chapter."
    );
    for (const reason of [
      "Feel more confident in bed",
      "Ask for what you want, without shame",
      "Bring your desire back when it fades",
    ])
      await expect(root).toContainText(reason);
    await saveShot(page, "6-report-map-today");
    await settle(page);
    await animationsDone(root);
    // The map and its legend: the footer below them is every question's own (progress strip,
    // Next), out of this sheet's hands.
    const results = await new AxeBuilder({ page })
      .include('[data-survey-sheet="reportMap"] [data-lenis-prevent]')
      .analyze();
    expect(results.violations).toEqual([]);
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
