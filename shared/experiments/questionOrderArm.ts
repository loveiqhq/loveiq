/**
 * C13 — the first five questions. A 50/50 test of the survey's OPENING ORDER.
 *
 * The teardown's case: the current opening spends slots 3-7 on questions that
 * barely move the archetype, and one of them (`01006`, "Sex often hurts or feels
 * physically bad for me") ends 5.1% of the sessions that reach it. Promoting five
 * high-signal trait questions in their place is projected at roughly double the
 * archetype power and about ten seconds less opening time — for a pure reorder,
 * with no wording, weight or scoring change anywhere.
 *
 * WHY THE ARM IS DERIVED, NOT MINTED. Every other experiment here used a cookie:
 * the survey theme (`surveyVariant`), the landing variant, the email position.
 * This one hashes the session id instead, for three reasons.
 *
 *  1. STICKINESS IS ALREADY SOLVED. The session id survives reload and
 *     back-navigation — `orderedOptions` already relies on exactly that to keep a
 *     randomised option order stable for one respondent. A question order that
 *     changed mid-survey would be far worse than a shuffled option list.
 *  2. NOTHING NEW TO RETIRE. The email-position test left a cookie, three stamped
 *     columns and a funnel filter behind, and unpicking them took its own
 *     migration (20260816120000). A derived arm leaves one function.
 *  3. IT IS RECOVERABLE. `survey_submission.session_id` is already stored, so a
 *     submission's arm can be recomputed after the fact even if the stamp is
 *     missing. The stamp is a convenience for querying, not the system of record.
 *
 * NO SESSION ID MEANS CONTROL. When storage is blocked `getSessionId` returns
 * empty, and the submit path records nothing to slice by. Those respondents get
 * the current order rather than a silently unattributable variant — the same rule
 * `orderedOptions` follows when it declines to shuffle without a session id.
 */

import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";

export type QuestionOrderArm = "control" | "variant";

/** The experiment's key in `survey_submission.utm_tracker`. */
export const QUESTION_ORDER_ARM_KEY = "question_order_arm";

export function isQuestionOrderArm(value: unknown): value is QuestionOrderArm {
  return value === "control" || value === "variant";
}

/**
 * Preview override. `?order=control` or `?order=variant` on `/survey`, so either
 * arm can be inspected deterministically on dev and staging. Returns null on
 * production, where it must never influence a real respondent's bucketing — the
 * same guard `resolveSurveyDevOverride` uses.
 */
export function resolveQuestionOrderOverride(
  param: string | null | undefined
): QuestionOrderArm | null {
  if (!isNonProdDeploy()) return null;
  return isQuestionOrderArm(param) ? param : null;
}

/**
 * FNV-1a, 32-bit. Not a security primitive: it only needs to spread session ids
 * evenly across two buckets. Salted with the experiment name so a visitor who
 * lands in one arm here is not correlated with their bucket in any future test
 * seeded from the same session id.
 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * This session's arm. Pure, deterministic and total: the same session id always
 * returns the same arm, and an absent one always returns control.
 */
export function assignQuestionOrderArm(sessionId: string | null | undefined): QuestionOrderArm {
  if (!sessionId?.trim()) return "control";
  return hash(`c13-opening-order:${sessionId}`) % 2 === 0 ? "control" : "variant";
}
