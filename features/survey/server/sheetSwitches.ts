/**
 * The switches of the sheets between questions (features/survey/surveySheets.ts): one
 * system_flags row per sheet, read with the default OFF, so a missing row (none is seeded) or
 * an unreadable table shows no sheet. The flag's SYSTEM_FLAG_ environment variable set to
 * true turns one on without a row (shared/flags/system-flags.ts). In production each stays
 * off until it is cleared. Fatih, 14 Nov: 1, 2 and 5 now (both C13 orders meet them alike);
 * 3, the expert, after the C13 check-in (20 Nov 2026), because C13's control order asks its
 * question too early for it, so only one C13 half would see it; 4 and 6 with Mark's new
 * EUR 1.99 page, and then only for its half of his 50/50 (surveySheets.ts).
 */

import { isFeatureEnabled, type SystemFlagKey } from "@shared/flags/system-flags";
import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import {
  parseSheetsPreview,
  REVEAL_ONLY_SHEETS,
  SURVEY_SHEET_IDS,
  type SurveySheetId,
} from "@features/survey/surveySheets";

export const SURVEY_SHEET_SWITCHES = {
  science: "survey_sheet_science",
  trustpilot: "survey_sheet_trustpilot",
  expert: "survey_sheet_expert",
  halfway: "survey_sheet_halfway",
  desire: "survey_sheet_desire",
  reportMap: "survey_sheet_report_map",
} as const satisfies Record<SurveySheetId, SystemFlagKey>;

/**
 * The sheets whose switch is on, in Mark's order. The two that promise a free archetype
 * (REVEAL_ONLY_SHEETS) also need Mark's new EUR 1.99 page on, `report_gate_archetype_reveal`,
 * whatever their own switches say: without that page nobody gets the archetype for free.
 */
export async function enabledSurveySheets(): Promise<SurveySheetId[]> {
  const [on, revealOn] = await Promise.all([
    Promise.all(SURVEY_SHEET_IDS.map((id) => isFeatureEnabled(SURVEY_SHEET_SWITCHES[id], false))),
    isFeatureEnabled("report_gate_archetype_reveal", false),
  ]);
  return SURVEY_SHEET_IDS.filter(
    (id, i) => on[i] === true && (revealOn === true || !REVEAL_ONLY_SHEETS.has(id))
  );
}

/**
 * The sheets a visit to /survey gets: those whose switch is on, plus a `?sheets=all` (or
 * `?sheets=science,halfway`) preview on dev, previews and staging, never production.
 * SURVEY_SHEETS_PREVIEW=1 allows the preview on the production build the end-to-end tests
 * run against; nothing else sets it. Any failure reading the switches shows none.
 */
export async function surveySheetsForVisit(
  preview: string | string[] | undefined
): Promise<SurveySheetId[]> {
  return (await surveySheetsOffer(preview)).sheets;
}

/**
 * The same, with the ones the preview named: those open whichever half of Mark's 50/50 the
 * reviewer's own session is in (the browser holds back only switched ones,
 * sheetsForRevealArm).
 */
export async function surveySheetsOffer(
  preview: string | string[] | undefined
): Promise<{ sheets: SurveySheetId[]; previewed: SurveySheetId[] }> {
  const previewed =
    isNonProdDeploy() || process.env.SURVEY_SHEETS_PREVIEW === "1"
      ? parseSheetsPreview(preview)
      : [];
  let switched: SurveySheetId[] = [];
  try {
    switched = await enabledSurveySheets();
  } catch {
    switched = [];
  }
  return {
    sheets: SURVEY_SHEET_IDS.filter((id) => previewed.includes(id) || switched.includes(id)),
    previewed,
  };
}
