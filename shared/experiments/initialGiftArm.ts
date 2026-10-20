/**
 * E07's holdout (Pre-unlock, Notion "RFD > Pre-Unlock"; Figma Report-3.0 1669:2835). Of
 * the readers the EUR 1.99 gate stopped who have still not paid four days after they first
 * met it, 80% are given the initial unlock (a EUR 0 `initial` payment) and the E07 email;
 * 20% are held out and get nothing, so the gift's pull on full-report sales can be read
 * against readers it never reached.
 *
 * WHY THE ARM IS DERIVED FROM THE REPORT ID. A pure function of `personal_report.id`: the
 * same report always lands on the same arm, nothing is minted that has to be retired, and
 * the cron (app/api/cron/initial-unlock-gift) writes the arm to
 * `personal_report.initial_gift_arm` when it treats the report, which is what readouts join
 * on. A report that paid before day 4 is never given an arm, so it is in neither.
 *
 * READING THE RESULT. Compare full-report purchases after day 4 between the two arms
 * (`initial_gift_arm`), staff reports left out; the gift's own row is EUR 0, never revenue.
 * The board also asks for EUR 1.99 conversion in the first three days, before and after the
 * launch, and for unsubscribes and spam reports on E07 (Resend's events, stage
 * `initial_gift`).
 */

import { sessionArmHash } from "@shared/experiments/sessionHash";

export type InitialGiftArm = "gift" | "holdout";

/** The salt. A new one re-buckets every report, so it changes only with a new test. */
export const INITIAL_GIFT_EXPERIMENT = "initial_gift_2026_10";

/**
 * Four buckets in five: 80% gift, 20% holdout. The experiments' own hash (sessionHash.ts),
 * salted with this test's name, as C13 and the email question draw theirs; not an email
 * A/B pick, since the arm decides a grant and lives on the report, not on a send.
 */
export function assignInitialGiftArm(personalReportId: number): InitialGiftArm {
  return sessionArmHash(`${INITIAL_GIFT_EXPERIMENT}:${personalReportId}`) % 5 < 4
    ? "gift"
    : "holdout";
}
