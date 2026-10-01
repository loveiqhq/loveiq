/**
 * The pay pop-up test (Marcus, 2026-09-29). A 50/50 split of V4's readers: half
 * get the plans pop-up as built (it opens at Challenges in Partnerships), half
 * never get it on their own. Both keep every lock, card and the sticky
 * "Unlock full report" bar, so the only thing that differs is the automatic open.
 *
 * PHONES ONLY SINCE 01.10. Mark's desktop review took the pop-up out from 700px
 * (Fatih: desktop only), so a desktop reader logs no exposure and is in neither
 * arm. Readers before that change include desktops: split by device when a
 * comparison spans it.
 *
 * WHY THE ARM IS DERIVED FROM THE SUBMISSION ID. Same reasons as the C13 order
 * test (`questionOrderArm.ts`): a reader keeps one arm on every visit and every
 * device, nothing is minted that has to be retired, and a submission's arm can be
 * recomputed later from `survey_submission.id` alone — which is how sales, in the
 * payment ledger, are joined to arms. Keyed on the submission rather than the
 * report token because the token lives in two shapes.
 *
 * READING THE RESULT.
 *
 *  - Compare readers who REACHED the pop-up point, in both arms. The
 *    `experiment_exposure` event marks that moment for both — in `no_popup` it is
 *    where the pop-up would have opened — and its `surface` names the chapter
 *    that fired it, so readers who reached it by another route can be set aside.
 *    Comparing "saw the pop-up" against everyone else is not this test: only
 *    about 3 in 10 readers get that far, and they read longer and buy more anyway.
 *  - Filter by V4's launch date. The arm is a pure function, so it returns an arm
 *    for every submission ever made, including all the ones that predate V4.
 *  - Leave staff reports out (`app_user.email ~* '^.+@loveiq\.org$'`): the team
 *    reviews V4 on its own submissions, which are bucketed like anyone's.
 *  - Judge on exits in the 30s after the point and on the median time read after
 *    it. Sales are the safety check, not the verdict: at 2 sales in 5 weeks, a
 *    doubling takes over two years of readers to show.
 *
 * NO SUBMISSION ID MEANS NOT IN THE TEST. Such a reader gets the pop-up as built
 * and logs no exposure, so they fall out of both arms rather than into one.
 */

import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import { pickClientVariant } from "@shared/experiments/clientBucket";

export type PopupArm = "popup" | "no_popup";

/** The salt, and the `experiment` name on every exposure event. */
export const POPUP_EXPERIMENT = "report_popup_2026_10";

/**
 * Preview override: `?popup=on` or `?popup=off` on a V4 report shows either arm
 * on dev and staging, whatever the reader's bucket. Ignored on production.
 */
export function resolvePopupArmOverride(param: string | null | undefined): PopupArm | null {
  if (!isNonProdDeploy()) return null;
  if (param === "on") return "popup";
  if (param === "off") return "no_popup";
  return null;
}

/** This submission's arm; null when there is no submission to key it on. */
export function assignPopupArm(submissionId: number | null | undefined): PopupArm | null {
  if (!submissionId) return null;
  return pickClientVariant(String(submissionId), POPUP_EXPERIMENT) === "a" ? "no_popup" : "popup";
}
