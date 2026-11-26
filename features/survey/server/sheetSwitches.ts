/**
 * The switches of the sheets between questions (features/survey/surveySheets.ts): one
 * system_flags row per sheet, read with the default OFF, so a missing row (none is seeded) or
 * an unreadable table shows no sheet. The flag's SYSTEM_FLAG_ environment variable set to
 * true turns one on without a row (shared/flags/system-flags.ts). In production each stays
 * off until it is cleared. Fatih, 14 Nov: 1, 2 and 5 now (both C13 orders meet them alike);
 * 3, the expert, after the C13 check-in (20 Nov 2026), because C13's control order asks its
 * question too early for it, so only one C13 half would see it (the test has ended since, and
 * every new run is asked the order where it opens); 4 and 6 with Mark's 50/50 of
 * his new EUR 1.99 page, when both halves meet them, each in its page's words (surveySheets.ts,
 * Mark 16 Nov).
 */

import { areFeaturesEnabled, type SystemFlagKey } from "@shared/flags/system-flags";
import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import { isGatePriceEnabled } from "@features/report/server/gateRevealSwitch";
import {
  GATE_TEST_SHEETS,
  parseSheetsPreview,
  RETIRED_SHEETS,
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
 * The sheets whose switch is on, in Mark's order. The two that tell what EUR 1.99 opens
 * (GATE_TEST_SHEETS) are the EUR 1.99 page's tests', so they also need one of their switches,
 * `report_gate_archetype_reveal` (Mark's 50/50) or `report_gate_choose_price` (the price test
 * that replaced it), whatever their own say: they run with a test, never alone. In the price
 * test only today's page's half meets them (SurveyEngine, Fatih 24 Nov).
 */
export async function enabledSurveySheets(): Promise<SurveySheetId[]> {
  // One read for the eight switches, not eight (areFeaturesEnabled).
  const on = await areFeaturesEnabled(
    [
      ...SURVEY_SHEET_IDS.map((id) => SURVEY_SHEET_SWITCHES[id]),
      "report_gate_archetype_reveal",
      "report_gate_choose_price",
    ],
    false
  );
  const testOn = on[SURVEY_SHEET_IDS.length] === true || on[SURVEY_SHEET_IDS.length + 1] === true;
  return SURVEY_SHEET_IDS.filter(
    (id, i) => on[i] === true && (testOn || !GATE_TEST_SHEETS.has(id))
  );
}

/**
 * Whether this visit's survey runs in the EUR 1.99 page's price test (gatePriceArm.ts): its
 * switch, or a `?price=1` preview on dev, previews and staging, never production. The engine
 * then skips the two sheets that tell what EUR 1.99 opens for the half that chooses its price:
 * nothing in them is true of that page (Fatih, 24 Nov 2026). Off on any failure.
 */
export async function gatePriceTestForVisit(
  preview: string | string[] | undefined
): Promise<boolean> {
  const param = Array.isArray(preview) ? preview[0] : preview;
  if (isNonProdDeploy() && param === "1") return true;
  return isGatePriceEnabled().catch(() => false);
}

/**
 * The sheets a visit to /survey gets: those whose switch is on, plus a `?sheets=all` (or
 * `?sheets=science,halfway`) preview on dev, previews and staging, never production.
 * SURVEY_SHEETS_PREVIEW=1 allows the preview on the production build the end-to-end tests
 * run against; nothing else sets it. Any failure reading the switches shows none. A sheet taken
 * out of the survey (RETIRED_SHEETS: sheet 4 since 26 Nov 2026, Mark's ask of 25 Nov) never comes from its switch.
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
  return SURVEY_SHEET_IDS.filter(
    (id) => previewed.includes(id) || (switched.includes(id) && !RETIRED_SHEETS.has(id))
  );
}
