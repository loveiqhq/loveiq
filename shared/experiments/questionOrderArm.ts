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
 * READING THE RESULT: FILTER BY START DATE, ALWAYS.
 *
 * The arm is a pure function of the session id, which means it returns an arm for
 * EVERY session ever recorded — including the thousands that predate this
 * experiment and therefore all saw the control order. A readout that does not
 * restrict itself to sessions started after launch is not measuring the
 * experiment; it is splitting historical traffic on a hash and reporting the
 * difference.
 *
 * That is not a theoretical worry. Applying the pre-finalizer arm to the 28 days
 * BEFORE launch produced a 10.5-point "variant win", positive in all four
 * independent weeks, for people who had never seen a variant. The null
 * distribution over 200 random partitions of the same sessions was mean 0.04,
 * sd 3.30 — so it read as a solid, actionable result and was noise plus a bad
 * hash. Anyone running "last 30 days" would have shipped on it.
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
 * FNV-1a, 32-bit, FINISHED WITH AN AVALANCHE STEP. Not a security primitive: it
 * only needs to spread session ids evenly across two buckets, and — because it is
 * salted with the experiment name — to spread them DIFFERENTLY from any other test
 * seeded the same way.
 *
 * WHY THE FINALIZER IS NOT OPTIONAL. Taking `% 2` of raw FNV-1a is not a coin
 * flip. The multiplier (0x01000193) is odd, so multiplying never changes the low
 * bit, and the whole hash collapses to
 *
 *     low bit = parity(offset basis) XOR parity(c1) XOR ... XOR parity(cn)
 *
 * — i.e. "does this string contain an odd number of odd-valued characters?".
 * Measured on production data before this changed: the arm agreed with that
 * parity on 500 of 500 session ids, with no cross-cells at all.
 *
 * Two consequences, one harmless and one not:
 *
 *   - Balance was FINE (50.24% over 200k random uuids), because that parity is
 *     itself unbiased for a random uuid. So the split was valid.
 *   - The SALT DID NOTHING. Changing it can only flip the parity wholesale, so it
 *     re-labels the two groups without re-drawing them. Measured: changing the salt
 *     moved 0.00% of 200,000 ids between buckets. The promise made right above this
 *     comment — that a future test seeded from the same session id would be
 *     uncorrelated — was therefore exactly false: it would have produced the
 *     identical split, or its exact complement, and the two experiments would have
 *     been impossible to tell apart afterwards.
 *
 * `fmix32` is murmur3's finalizer, whose entire job is to make every output bit
 * depend on every input bit. With it, changing the salt moves 50.04% of ids —
 * a genuinely independent draw. Picking a different single bit of the unfinished
 * hash (the top one balances and salts fine too) would have worked by luck rather
 * than by construction, which is the same mistake one bit over.
 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix32(h);
}

/** murmur3's 32-bit finalizer. Mirrored exactly by `c13_arm()` in SQL. */
function fmix32(input: number): number {
  let h = input;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
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
