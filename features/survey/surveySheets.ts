/**
 * The sheets between questions: Mark's "Survey & Report Components" (Claude Design
 * NGyoLVAex5vSW4voVs7Tcc, page "Survey – Proposal 10.11.2026"), posted to Fatih and Eman on
 * 11 Nov 2026 with "Can you work your magic with animations on these components please".
 *
 * Six short cards open at fixed points in the survey: a research stat, a Trustpilot rating, an
 * expert's quote, a halfway marker, a State of Desire promotion and a map of the report. Each
 * has a "Keep going" that carries on, opens once per run, and sits behind its own switch
 * (features/survey/server/sheetSwitches.ts), so staging can show them while production does
 * not. SurveyEngine opens and closes them; features/survey/ui/sheets draws them. Their words
 * are in features/survey/surveySheetsCopy.ts.
 *
 * Pure module: no React, no storage outside the helpers at the bottom.
 */

import type { QuestionOrderArm } from "@shared/experiments/questionOrderArm";

export type SurveySheetId =
  "science" | "trustpilot" | "expert" | "halfway" | "desire" | "reportMap";

/**
 * Where a sheet opens. Always by question id, never by position: the C13 test asked the same
 * questions in two orders (questionOrder.ts), a draft begun in the old one still resumes in it,
 * and Survey 2.0 asks them in a third, with spots of its own (`survey2Placement`).
 *
 * - `after`: moving on from the question holds the move; the sheet opens over it, and
 *   "Keep going" moves on.
 * - `before`: arriving at the question opens the sheet over it; "Keep going" leaves the
 *   reader there to answer it. Never within the first `minIndex` questions, so a reorder that
 *   puts the question near the start does not open the sheet before people have warmed up.
 * - `remaining`: moving on from the question that leaves exactly `left` questions after it,
 *   so "Only 3 questions left" stays true in every order.
 */
export type SurveySheetPlacement =
  | { kind: "after"; qId: string }
  | { kind: "before"; qId: string; minIndex: number }
  | { kind: "remaining"; left: number };

export interface SurveySheetDef {
  id: SurveySheetId;
  /** Where it opens in the classic survey (C13's two orders). */
  placement: SurveySheetPlacement;
  /**
   * Where it opens in Survey 2.0: Mark's Survey Review, the Working-order board's SHEETS
   * (19 Nov 2026), each after a question of his new order.
   */
  survey2Placement: SurveySheetPlacement;
  /**
   * The sheet names a price (EUR 1.99, the State of Desire report). A reader who paid before
   * the survey never sees one.
   */
  priced: boolean;
  /** A bottom sheet over the question, or a full screen with Previous and Next (the map). */
  layout: "sheet" | "screen";
}

/**
 * Mark's six placements (10 Nov proposal; his boxes 1 to 6). His Q numbers follow the C13
 * test order, give or take one; the ids are what count:
 *
 * 1. Science, after 02004 "What kind of starting point usually leads to the best sex for you?"
 * 2. Trustpilot, after 03008 "I prefer sex that is intense and high-energy…"
 * 3. Expert quote, before 01005 "I want more variety…": in the new order (C13's, everyone's
 *    since the test ended) it is question 27, just before the second leak; in the old order,
 *    which a draft begun in it keeps, it is question 3, too early, so `minIndex` keeps it closed
 *    there. Survey 2.0 opens it after 03012 instead (survey2Placement).
 * 4. Halfway, after 11003 "During sex, I focus more on the other person's pleasure…" (32/62).
 * 5. State of Desire, after 16005 "Which of these best describes where your sexuality feels
 *    right now?"
 * 6. The report map, when three questions are left: true in every classic order.
 *
 * Survey 2.0 (his Survey Review, 19 Nov 2026) has its own spot for each (`survey2Placement`):
 * Trustpilot after 03013, science after 02004, the expert after 03012, halfway after 14021,
 * State of Desire after 16005, the map after 17002.
 */
/** The question sheet 1 speaks to: it shows the share of people who gave the reader's answer. */
export const SCIENCE_QID = "02004";

export const SURVEY_SHEETS: readonly SurveySheetDef[] = [
  {
    id: "science",
    placement: { kind: "after", qId: SCIENCE_QID },
    survey2Placement: { kind: "after", qId: SCIENCE_QID },
    priced: false,
    layout: "sheet",
  },
  {
    id: "trustpilot",
    placement: { kind: "after", qId: "03008" },
    // Social proof after the first easy stretch, before satisfaction (01002) at Q11.
    survey2Placement: { kind: "after", qId: "03013" },
    priced: false,
    layout: "sheet",
  },
  {
    id: "expert",
    placement: { kind: "before", qId: "01005", minIndex: 10 },
    // Closes the Arousal block as a breather before Attachment starts.
    survey2Placement: { kind: "after", qId: "03012" },
    priced: false,
    layout: "sheet",
  },
  {
    id: "halfway",
    placement: { kind: "after", qId: "11003" },
    // Right before 01005, 02001 and 01006, the questions that still lose the most: screen 31 of 61.
    survey2Placement: { kind: "after", qId: "14021" },
    priced: true,
    layout: "sheet",
  },
  {
    id: "desire",
    placement: { kind: "after", qId: "16005" },
    survey2Placement: { kind: "after", qId: "16005" },
    priced: true,
    layout: "sheet",
  },
  {
    id: "reportMap",
    placement: { kind: "remaining", left: 3 },
    // What the report holds, right before the price question and the details page.
    survey2Placement: { kind: "after", qId: "17002" },
    priced: true,
    layout: "screen",
  },
];

/** Where a sheet opens for a run in `arm`: its 2.0 spot in Survey 2.0, its classic one otherwise. */
export function placementFor(
  def: SurveySheetDef,
  arm: QuestionOrderArm | undefined
): SurveySheetPlacement {
  return arm === "survey2" ? def.survey2Placement : def.placement;
}

export const SURVEY_SHEET_IDS: readonly SurveySheetId[] = SURVEY_SHEETS.map((s) => s.id);

/**
 * The two sheets that tell the reader what EUR 1.99 opens: the halfway sheet and the report
 * map. They are the survey's half of Mark's 50/50 of his new EUR 1.99 page
 * (shared/experiments/gateRevealArm.ts). Every reader meets them, in the words of the page that
 * follows (his write-up, 16 Nov): before his new page the Core Archetype is free and the Light
 * Report costs EUR 1.99; before today's page the Core Archetype is in the EUR 1.99. They run
 * only while that test does (server/sheetSwitches.ts); a staging preview (`?sheets=`) still
 * shows them.
 */
export const GATE_TEST_SHEETS: ReadonlySet<SurveySheetId> = new Set(["halfway", "reportMap"]);

export function isSurveySheetId(value: unknown): value is SurveySheetId {
  return typeof value === "string" && (SURVEY_SHEET_IDS as readonly string[]).includes(value);
}

export function surveySheetDef(id: SurveySheetId): SurveySheetDef {
  return SURVEY_SHEETS.find((s) => s.id === id)!;
}

/** What the engine knows about the run when it asks for a sheet. */
export interface SheetContext {
  /** The switches that are on, plus any staging preview (app/survey/page.tsx). */
  enabled: readonly SurveySheetId[];
  /** Sheets this run has already seen. */
  shown: ReadonlySet<SurveySheetId>;
  /** A reader who paid before the survey: no sheet with a price. */
  payToStart: boolean;
  /** The run's order: Survey 2.0's runs meet the sheets at its spots. Classic when absent. */
  arm?: QuestionOrderArm;
}

function available(def: SurveySheetDef, ctx: SheetContext): boolean {
  return ctx.enabled.includes(def.id) && !ctx.shown.has(def.id) && !(def.priced && ctx.payToStart);
}

/**
 * The sheet that moving on from the question at `index` (id `qId`) opens, if any. One at
 * most: the first in Mark's order wins.
 */
export function sheetAfterQuestion(
  qId: string | undefined,
  index: number,
  total: number,
  ctx: SheetContext
): SurveySheetId | null {
  if (!qId) return null;
  const after = total - 1 - index;
  for (const def of SURVEY_SHEETS) {
    if (!available(def, ctx)) continue;
    const p = placementFor(def, ctx.arm);
    if (p.kind === "after" && p.qId === qId) return def.id;
    if (p.kind === "remaining" && after === p.left) return def.id;
  }
  return null;
}

/** The sheet that arriving at the question at `index` (id `qId`) opens, if any. */
export function sheetBeforeQuestion(
  qId: string | undefined,
  index: number,
  ctx: SheetContext
): SurveySheetId | null {
  if (!qId) return null;
  for (const def of SURVEY_SHEETS) {
    if (!available(def, ctx)) continue;
    const p = placementFor(def, ctx.arm);
    if (p.kind === "before" && p.qId === qId && index >= p.minIndex) return def.id;
  }
  return null;
}

/**
 * `?sheets=` on dev, previews and staging (never production; app/survey/page.tsx checks):
 * `all`, or a comma list of ids. Anything else previews nothing.
 */
export function parseSheetsPreview(param: string | string[] | null | undefined): SurveySheetId[] {
  const raw = Array.isArray(param) ? param.join(",") : param;
  if (!raw) return [];
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.includes("all")) return [...SURVEY_SHEET_IDS];
  return SURVEY_SHEET_IDS.filter((id) => parts.includes(id));
}

/** How the reader closed a sheet. */
export type SurveySheetCloseVia =
  "keep_going" | "backdrop" | "escape" | "swipe" | "back" | "previous";

/**
 * Remembers which sheets this run has seen, so each opens once per run: not again after a
 * reload, a pause or Previous. Keyed by the run's start time, which the draft keeps, so the
 * next run (a retake, Start Over) sees them again. The opt-in sheet's way
 * (features/survey/optInSheet.ts), for six sheets.
 */
export const SURVEY_SHEETS_STORAGE_KEY = "loveiq-survey-sheets";

export function sheetsShownFor(startedAt: string): Set<SurveySheetId> {
  try {
    const raw = localStorage.getItem(SURVEY_SHEETS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { run?: unknown; shown?: unknown };
    if (parsed.run !== startedAt || !Array.isArray(parsed.shown)) return new Set();
    return new Set(parsed.shown.filter(isSurveySheetId));
  } catch {
    // Storage blocked or unreadable: SurveyEngine still remembers them for this page.
    return new Set();
  }
}

/**
 * The State of Desire sheet's tick (Mark, 13 Nov: "lets just record the tick for now"), kept
 * for the run that gave it: it is given at Q48 and sent with the answers at the end, so it has
 * to outlive a reload in between, and never reach the next run.
 */
export const DESIRE_TICK_STORAGE_KEY = "loveiq-survey-desire-tick";

export function rememberDesireTick(startedAt: string, ticked: boolean): void {
  try {
    if (ticked) localStorage.setItem(DESIRE_TICK_STORAGE_KEY, startedAt);
    else localStorage.removeItem(DESIRE_TICK_STORAGE_KEY);
  } catch {
    // Storage blocked: SurveyEngine still keeps it for this page.
  }
}

export function desireTickedFor(startedAt: string): boolean {
  try {
    return localStorage.getItem(DESIRE_TICK_STORAGE_KEY) === startedAt;
  } catch {
    return false;
  }
}

/**
 * Every sheet opens again in this run: the staging jump menu's replay (Fatih, 15 Nov), so a
 * reviewer who has seen a sheet once can see it again without starting a new run. Only the
 * jump menu calls it, and that is never on the live site.
 */
export function forgetSheetsShown(): void {
  try {
    localStorage.removeItem(SURVEY_SHEETS_STORAGE_KEY);
  } catch {
    // Storage blocked: SurveyEngine forgets them for this page.
  }
}

export function rememberSheetShown(startedAt: string, id: SurveySheetId): void {
  try {
    const shown = sheetsShownFor(startedAt);
    shown.add(id);
    localStorage.setItem(
      SURVEY_SHEETS_STORAGE_KEY,
      JSON.stringify({ run: startedAt, shown: [...shown] })
    );
  } catch {
    // Storage blocked: SurveyEngine still remembers it for this page.
  }
}
