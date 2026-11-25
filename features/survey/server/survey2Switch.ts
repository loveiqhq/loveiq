/**
 * What a visit to /survey does with Survey 2.0 (Mark's Survey Review, 19 Nov 2026: the new guide
 * before the first question and the 2.0 screens after it). One switch, `survey_2`, read with the
 * default OFF, so a missing row or an unreadable table gives today's survey (`off`). While it is
 * on, the visit runs the Survey 2.0 test (`test`: half of the fresh runs get 2.0, by session id,
 * shared/experiments/questionOrderArm.ts). It decides only what a FRESH run gets: a draft keeps
 * the order it began in (resolveDraftQuestionOrderArm).
 *
 * `?order=survey2` previews 2.0 for every run (`forced`), and `?order=control` / `?order=variant`
 * preview today's survey while the switch is on, where previews are allowed: dev, previews and
 * staging, and the e2e server, whose SURVEY_SHEETS_PREVIEW=1 (playwright.config.ts) opens the
 * survey's previews. Never production. The e2e server is a production build, so its browser
 * can't read the preview itself: this answer carries it.
 */

import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import { isFeatureEnabled } from "@shared/flags/system-flags";
import type { Survey2Visit } from "@shared/experiments/questionOrderArm";

export async function survey2ForVisit(order: string | string[] | undefined): Promise<Survey2Visit> {
  const previewAllowed = isNonProdDeploy() || process.env.SURVEY_SHEETS_PREVIEW === "1";
  const param = Array.isArray(order) ? order[0] : order;
  if (previewAllowed && param === "survey2") return "forced";
  if (previewAllowed && (param === "control" || param === "variant")) return "off";
  try {
    return (await isFeatureEnabled("survey_2", false)) === true ? "test" : "off";
  } catch {
    return "off";
  }
}
