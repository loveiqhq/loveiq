/**
 * The sheets between the survey's questions as AP-Analytics shows them (Mark's Survey copy
 * board, 17–18 Nov 2026): their names, where each sits in an order's question funnel, and their
 * rates. Where a sheet opens comes from the survey's own placements
 * (features/survey/surveySheets.ts), so the page follows the live survey when they move.
 */
import { rangeLabel } from "@features/admin/server/ap/filters";
import {
  AP_SHEET_IDS,
  MISS_OUT_SHEET,
  SHEET_FIRST_DAYS,
  type ApSheetId,
  type SheetFigures,
} from "@features/admin/server/ap/posthog";
import type { QuestionRow } from "@features/admin/server/ap/survey";
import { SURVEY_SHEETS } from "@features/survey/surveySheets";
import { OPT_IN_QID } from "@features/survey/ui/questionOrder";

/**
 * Mark's names for the six sheets, numbered in his order (his boxes 1 to 6, the survey's own
 * order), then the opt-in's miss-out sheet as 7 (Eman, 25 Nov 2026). Two have something to tap,
 * so a conversion: the State of Desire sheet's "Email me a 5€ off code" box and the miss-out
 * sheet's "Yes, I want to keep learning".
 */
export const SHEET_NAMES: Record<ApSheetId, { name: string; kind: string; tap?: true }> = {
  science: { name: "Science · responsive desire", kind: "Research note in a bottom sheet" },
  trustpilot: { name: "Trustpilot testimonial", kind: "One real review in a bottom sheet" },
  expert: { name: "Expert quote", kind: "A researcher’s view in a bottom sheet" },
  halfway: { name: "Halfway · profile filling in", kind: "Halfway reward" },
  desire: { name: "State of Desire report promo", kind: "Stats + promo", tap: true },
  reportMap: { name: "How to read your report", kind: "Report map" },
  [MISS_OUT_SHEET]: {
    name: "Opt-in · Sure you want to miss out?",
    kind: "Asks again after a No to the hints emails",
    tap: true,
  },
};

/**
 * The sheets' badge colour: Mark's orange → orchid → violet (Survey copy board), each stop
 * darkened until white numbers read at 5:1 or better (his #fe6839, #bf66d9, #958ef6 give 2.8–3.4).
 */
export const SHEET_BADGE_BG = "bg-[linear-gradient(135deg,#c2410c_0%,#8e3fa8_50%,#5b52d6_100%)]";

/** A sheet's number, 1 to 7, as the page writes it. */
export const sheetNumber = (id: ApSheetId) => AP_SHEET_IDS.indexOf(id) + 1;

export interface SheetSpot {
  id: ApSheetId;
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
 * that leaves three to go. A sheet whose question is not asked in the order has none. The
 * miss-out sheet opens on leaving the opt-in (16015) with a No, which the survey asks last: after
 * it, while it is the order's last question.
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
  const last = asked.length - 1;
  if (last >= 0 && asked[last]!.id === OPT_IN_QID)
    spots.push({
      id: MISS_OUT_SHEET,
      n: sheetNumber(MISS_OUT_SHEET),
      after: last,
      q: last,
      where: `After #${asked[last]!.n}`,
    });
  return spots;
}

/** Left the survey with it open, of those whose outcome is known (null: nobody yet). */
export const sheetBounce = (f: SheetFigures | undefined) =>
  f && f.settled > 0 ? f.leftOpen / f.settled : null;

/** Tapped what it offers, of everyone it opened for: only for a sheet with something to tap. */
export const sheetConversion = (f: SheetFigures | undefined) =>
  f && f.saw > 0 ? f.ticked / f.saw : null;

/**
 * The Conversion tile: every tap over everyone the sheets with something to tap opened for (the
 * State of Desire and miss-out sheets), with the taps.
 */
export function tapConversion(bySheet: Partial<Record<ApSheetId, SheetFigures>> | undefined): {
  rate: number | null;
  taps: number;
} {
  const tapped = AP_SHEET_IDS.filter((id) => SHEET_NAMES[id].tap).map((id) => bySheet?.[id]);
  const saw = tapped.reduce((n, f) => n + (f?.saw ?? 0), 0);
  const taps = tapped.reduce((n, f) => n + (f?.ticked ?? 0), 0);
  return { rate: saw > 0 ? taps / saw : null, taps };
}

/** "17 Nov 2026" when the range starts before the sheet's first day: its figures are from then. */
export function sheetCountedFrom(id: ApSheetId, rangeFrom: string): string | null {
  const first = SHEET_FIRST_DAYS[id];
  return rangeFrom < first ? rangeLabel(first, first) : null;
}
