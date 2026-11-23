/**
 * Whether a visit to /survey starts Survey 2.0 (Mark's Survey Review, 19 Nov 2026): the new guide
 * before the first question and the 2.0 screens after it. One switch, `survey_2`, read with the
 * default OFF, so a missing row or an unreadable table gives today's survey. It decides only what
 * a FRESH run gets: a draft keeps the order it began in (resolveDraftQuestionOrderArm).
 *
 * `?order=survey2` previews it, and `?order=control` / `?order=variant` preview today's survey
 * while the switch is on, where previews are allowed: dev, previews and staging, and the e2e
 * server, whose SURVEY_SHEETS_PREVIEW=1 (playwright.config.ts) opens the survey's previews. Never
 * production.
 */

import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import { isFeatureEnabled } from "@shared/flags/system-flags";

export async function survey2ForVisit(order: string | string[] | undefined): Promise<boolean> {
  const previewAllowed = isNonProdDeploy() || process.env.SURVEY_SHEETS_PREVIEW === "1";
  const param = Array.isArray(order) ? order[0] : order;
  if (previewAllowed && param === "survey2") return true;
  if (previewAllowed && (param === "control" || param === "variant")) return false;
  try {
    return (await isFeatureEnabled("survey_2", false)) === true;
  } catch {
    return false;
  }
}
