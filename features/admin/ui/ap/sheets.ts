/**
 * The sheets between the survey's questions as AP-Analytics shows them (Mark's Survey copy
 * board, 17–18 Nov 2026): their names, where each sits in an order's question funnel, and their
 * rates. Where a sheet opens comes from the survey's own placements
 * (features/survey/surveySheets.ts), so the page follows the live survey when they move.
 */
import type { SheetFigures } from "@features/admin/server/ap/posthog";
import type { QuestionRow } from "@features/admin/server/ap/survey";
import { SURVEY_SHEETS, type SurveySheetId } from "@features/survey/surveySheets";

/**
 * Mark's names for the six sheets, numbered in his order (his boxes 1 to 6, the survey's own
 * order). Only the State of Desire sheet has something to tap (its "Email me a 5€ off code"
 * box), so only it has a conversion.
 */
export const SHEET_NAMES: Record<SurveySheetId, { name: string; kind: string; tap?: true }> = {
  science: { name: "Science · responsive desire", kind: "Research note in a bottom sheet" },
  trustpilot: { name: "Trustpilot testimonial", kind: "One real review in a bottom sheet" },
  expert: { name: "Expert quote", kind: "A researcher’s view in a bottom sheet" },
  halfway: { name: "Halfway · profile filling in", kind: "Halfway reward" },
  desire: { name: "State of Desire report promo", kind: "Stats + promo", tap: true },
  reportMap: { name: "How to read your report", kind: "Report map" },
};

/** A sheet's number, 1 to 6, as the page writes it. */
export const sheetNumber = (id: SurveySheetId) => SURVEY_SHEETS.findIndex((s) => s.id === id) + 1;

export interface SheetSpot {
  id: SurveySheetId;
  n: number;
  /** The question it comes after, as its index among the order's questions asked now. */
  after: number;
  /** The question it opens over (the one after it, for a sheet that opens on arriving). */
  q: number;
  /** "After #32", or "Before #27" for a sheet that opens on arriving at its question. */
  where: string;
}

/**
 * Where each sheet sits in one order's funnel, between two of the questions asked now: after
 * its question, before its question (only from the survey's `minIndex` on, so the expert's
 * sheet has no place in the old order, which asks its question third), or after the question
 * that leaves three to go. A sheet whose question is not asked in the order has none.
 */
export function sheetSpots(rows: QuestionRow[]): SheetSpot[] {
  const asked = rows.filter((r) => r.n > 0);
  const at = new Map(asked.map((r, i) => [r.id, i]));
  const spots: SheetSpot[] = [];
  SURVEY_SHEETS.forEach((def, k) => {
    const p = def.placement;
    if (p.kind === "after") {
      const i = at.get(p.qId);
      if (i !== undefined)
        spots.push({ id: def.id, n: k + 1, after: i, q: i, where: `After #${asked[i]!.n}` });
    } else if (p.kind === "before") {
      const i = at.get(p.qId);
      if (i !== undefined && i > 0 && i >= p.minIndex)
        spots.push({ id: def.id, n: k + 1, after: i - 1, q: i, where: `Before #${asked[i]!.n}` });
    } else {
      const i = asked.length - 1 - p.left;
      if (i >= 0)
        spots.push({ id: def.id, n: k + 1, after: i, q: i, where: `After #${asked[i]!.n}` });
    }
  });
  return spots;
}

/** Left the survey with it open, of those whose outcome is known (null: nobody yet). */
export const sheetBounce = (f: SheetFigures | undefined) =>
  f && f.settled > 0 ? f.leftOpen / f.settled : null;

/** Ticked its box, of everyone it opened for: only for a sheet with something to tap. */
export const sheetConversion = (f: SheetFigures | undefined) =>
  f && f.saw > 0 ? f.ticked / f.saw : null;
