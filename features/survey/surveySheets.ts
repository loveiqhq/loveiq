/**
 * The sheets between questions: Mark's "Survey & Report Components" (Claude Design
 * NGyoLVAex5vSW4voVs7Tcc, page "Survey – Proposal 10.11.2026"), posted to Fatih and Eman on
 * 11 Nov 2026 with "Can you work your magic with animations on these components please".
 *
 * Six short cards open at fixed points in the survey: a research stat, a Trustpilot rating, an
 * expert's quote, a halfway marker, a State of Desire promotion and a map of the report. Each
 * has a "Keep going" that carries on, opens once per run, and sits behind its own switch
 * (features/survey/logic/sheetSwitches.ts), so staging can show them while production does
 * not. SurveyEngine opens and closes them; features/survey/ui/sheets draws them. Their words
 * are in features/survey/surveySheetsCopy.ts.
 *
 * Pure module: no React, no storage outside the helpers at the bottom.
 */

export type SurveySheetId =
  "science" | "trustpilot" | "expert" | "halfway" | "desire" | "reportMap";

/**
 * Where a sheet opens. Always by question id, never by position: the C13 test asks the same
 * questions in two orders (questionOrder.ts), and Eman's reorder will move them again.
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
  placement: SurveySheetPlacement;
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
 * 3. Expert quote, before 01005 "I want more variety…": in the C13 test order it is question
 *    27, just before the second leak; in today's control order it is question 3, too early, so
 *    `minIndex` keeps it closed there. Re-key it when Eman's reorder lands.
 * 4. Halfway, after 11003 "During sex, I focus more on the other person's pleasure…" (32/62).
 * 5. State of Desire, after 16005 "Which of these best describes where your sexuality feels
 *    right now?"
 * 6. The report map, when three questions are left: before the name question once the
 *    reorder moves it to the end, and true in every order meanwhile.
 */
/** The question sheet 1 speaks to: it shows the share of people who gave the reader's answer. */
export const SCIENCE_QID = "02004";

export const SURVEY_SHEETS: readonly SurveySheetDef[] = [
  { id: "science", placement: { kind: "after", qId: SCIENCE_QID }, priced: false, layout: "sheet" },
  { id: "trustpilot", placement: { kind: "after", qId: "03008" }, priced: false, layout: "sheet" },
  {
    id: "expert",
    placement: { kind: "before", qId: "01005", minIndex: 10 },
    priced: false,
    layout: "sheet",
  },
  { id: "halfway", placement: { kind: "after", qId: "11003" }, priced: true, layout: "sheet" },
  { id: "desire", placement: { kind: "after", qId: "16005" }, priced: true, layout: "sheet" },
  { id: "reportMap", placement: { kind: "remaining", left: 3 }, priced: true, layout: "screen" },
];

export const SURVEY_SHEET_IDS: readonly SurveySheetId[] = SURVEY_SHEETS.map((s) => s.id);

/**
 * The two sheets whose words promise the Core Archetype for free ("Core Archetype · Free" on
 * the halfway sheet, the report map's Free pill), which only Mark's new EUR 1.99 page gives.
 * His 50/50 shows that page to half the readers (shared/experiments/gateRevealArm.ts), so
 * these two open only for that half (Fatih, 14 Nov), and stay off while its switch is
 * (server/sheetSwitches.ts). A staging preview (`?sheets=`) still shows them to anyone.
 */
export const REVEAL_ONLY_SHEETS: ReadonlySet<SurveySheetId> = new Set(["halfway", "reportMap"]);

/** The sheets this reader may meet, given their half of Mark's 50/50 and any preview. */
export function sheetsForRevealArm(
  sheets: readonly SurveySheetId[],
  arm: "control" | "reveal",
  previewed: readonly SurveySheetId[]
): SurveySheetId[] {
  return sheets.filter(
    (id) => !REVEAL_ONLY_SHEETS.has(id) || arm === "reveal" || previewed.includes(id)
  );
}

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
    const p = def.placement;
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
    const p = def.placement;
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
