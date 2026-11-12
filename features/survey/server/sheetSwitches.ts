/**
 * The switches of the sheets between questions (features/survey/surveySheets.ts): one
 * system_flags row per sheet, read with the default OFF, so a missing row (none is seeded) or
 * an unreadable table shows no sheet. The flag's SYSTEM_FLAG_ environment variable set to
 * true turns one on without a row (shared/flags/system-flags.ts). In production each stays
 * off until it is cleared: 1, 2, 3 and 5 after the C13 check-in (20 Nov 2026), 4 and 6 with
 * the EUR 1.99 change their words describe.
 */

import { isFeatureEnabled, type SystemFlagKey } from "@shared/flags/system-flags";
import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import {
  parseSheetsPreview,
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

/** The sheets whose switch is on, in Mark's order. */
export async function enabledSurveySheets(): Promise<SurveySheetId[]> {
  const on = await Promise.all(
    SURVEY_SHEET_IDS.map((id) => isFeatureEnabled(SURVEY_SHEET_SWITCHES[id], false))
  );
  return SURVEY_SHEET_IDS.filter((_, i) => on[i] === true);
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
  return SURVEY_SHEET_IDS.filter((id) => previewed.includes(id) || switched.includes(id));
}
