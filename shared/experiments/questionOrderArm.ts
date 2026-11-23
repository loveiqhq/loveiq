/**
 * C13 — the first five questions. A 50/50 test of the survey's OPENING ORDER, from
 * 6 Oct 2026 to QUESTION_ORDER_TEST_END. Since then every new survey run is asked the
 * new order (QUESTION_ORDER_WINNER). What follows describes the test while it ran, which is
 * how its readouts still recompute each run's arm.
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
 * NO SESSION ID MEANT CONTROL while the test ran. When storage is blocked `getSessionId`
 * returns empty, and the submit path records nothing to slice by, so those respondents got
 * the current order rather than a silently unattributable variant. Since the end they are
 * asked the new order like everyone else.
 */

import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import { sessionArmHash } from "@shared/experiments/sessionHash";

/**
 * The order a run is asked. `control` and `variant` are C13's two (the old order, and the test's,
 * everyone's since it ended). `survey2` is Mark's Survey 2.0 (Survey Review, 19 Nov 2026): its own
 * screens, wording, closing questions and details page (features/survey/survey2/). A run gets it
 * only when it starts while the `survey_2` switch is on, and keeps whichever order it began in.
 */
export type QuestionOrderArm = "control" | "variant" | "survey2";

/** C13's two orders, the ones a classic run can be asked. */
export type ClassicOrderArm = Exclude<QuestionOrderArm, "survey2">;

/** Survey 2.0's arm. */
export const SURVEY_2_ARM = "survey2" satisfies QuestionOrderArm;

/**
 * The questions only Survey 2.0 asks: its three closing questions, which every 2.0 run answers
 * (they are required), so a submitted run that holds one was a 2.0 run (questionOrderArmOfSubmission).
 */
export const SURVEY_2_ONLY_QIDS = ["17001", "17002", "17003"] as const;

/** The experiment's key in `survey_submission.utm_tracker`. */
export const QUESTION_ORDER_ARM_KEY = "question_order_arm";

/**
 * The test's end. Fatih and Mark called it on 20 Nov 2026 for the new order, on finishing: of
 * the runs that reached question 3 from 6 Oct to 19 Nov, 46.3% finished in the new order
 * against 42.2% in the current one (482 and 491 runs), so more people reach the EUR 1.99 page.
 * Set just before the release merges, never after the moment it goes live: a run begun from
 * here on is asked the new order, so the arm its session id recomputes to no longer says what
 * it was shown, and it is outside every readout of the test.
 */
export const QUESTION_ORDER_TEST_END = "2026-11-21T11:43:00Z";

/** The order every new survey run is asked since the test ended. */
export const QUESTION_ORDER_WINNER = "variant" satisfies ClassicOrderArm;

export function isQuestionOrderArm(value: unknown): value is QuestionOrderArm {
  return value === "control" || value === "variant" || value === SURVEY_2_ARM;
}

/**
 * Preview override. `?order=control`, `?order=variant` or `?order=survey2` on `/survey`, so any
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
 * The split is `sessionArmHash` (sessionHash.ts) salted with this experiment's name;
 * why it is FNV-1a with murmur3's finalizer, and why that finalizer is not optional,
 * is written there.
 */

/**
 * The arm this session drew while the test ran. Pure, deterministic and total: the same
 * session id always returns the same arm, and an absent one always returns control.
 * Only for runs begun before QUESTION_ORDER_TEST_END: since the end nobody is dealt it
 * (questionOrderArmAt).
 */
export function assignQuestionOrderArm(sessionId: string | null | undefined): ClassicOrderArm {
  if (!sessionId?.trim()) return "control";
  return sessionArmHash(`c13-opening-order:${sessionId}`) % 2 === 0 ? "control" : "variant";
}

/**
 * The order a run begun at `startedAtMs` was asked: the arm its session id drew while the
 * test ran, the winner from the test's end on. For the server's stamp and the readouts; the
 * survey itself decides a run's order once, in resolveDraftQuestionOrderArm. A start that is
 * not a number reads as before the end.
 */
export function questionOrderArmAt(
  sessionId: string | null | undefined,
  startedAtMs: number
): ClassicOrderArm {
  return startedAtMs >= Date.parse(QUESTION_ORDER_TEST_END)
    ? QUESTION_ORDER_WINNER
    : assignQuestionOrderArm(sessionId);
}

/**
 * The order a SUBMITTED run was asked, for the server's stamp: Survey 2.0 when its answers hold one
 * of the questions only 2.0 asks (SURVEY_2_ONLY_QIDS), else what questionOrderArmAt gives. The
 * switch that gave the run 2.0 can't be read back for a past start, so the answers decide; they are
 * the run itself, and every 2.0 run answers all three.
 */
export function questionOrderArmOfSubmission(
  sessionId: string | null | undefined,
  startedAtMs: number,
  answeredQIds: readonly string[]
): QuestionOrderArm {
  const only: readonly string[] = SURVEY_2_ONLY_QIDS;
  return answeredQIds.some((qId) => only.includes(qId))
    ? SURVEY_2_ARM
    : questionOrderArmAt(sessionId, startedAtMs);
}

/**
 * The arm for a survey opened over what this device already holds.
 *
 * A DRAFT FROM BEFORE C13 KEEPS THE CONTROL ORDER. `assignQuestionOrderArm` hands an arm
 * to any session id, including one whose draft was begun before C13 reached production,
 * so about half of those drafts would reopen in the variant order under their saved
 * position. The variant pulls five later questions into the opening, and the survey only
 * moves forward from where it left off, so a reader resumed past the opening is never
 * asked them — the five strongest trait questions in the scoring. On 2026-10-06 production
 * held 260 unfinished drafts from the previous 14 days that were past the opening.
 *
 * So the arm a draft recorded wins. A draft with progress and no recorded arm predates C13
 * and stays in control. `useSurveyState` records the result in the draft, so it is decided
 * once per run.
 *
 * A FRESH RUN (no arm recorded, and nothing answered or only the landing card's question) IS
 * ASKED THE WINNER. While the test ran it was bucketed by its session id; since the end every
 * new run gets the new order, whatever its id. A draft that recorded an arm during the test
 * keeps it, even with nothing answered, for the same reason a draft from before C13 does.
 *
 * `freshArm` is what a fresh run gets: Survey 2.0 while the `survey_2` switch is on
 * (features/survey/server/survey2Switch.ts), the winner otherwise. Only a fresh run reads it: a
 * draft in a classic order keeps that order when the switch comes on, and a 2.0 draft keeps 2.0
 * when it goes off.
 */
export function resolveDraftQuestionOrderArm(
  draft: DraftOrder,
  freshArm: QuestionOrderArm = QUESTION_ORDER_WINNER
): QuestionOrderArm {
  if (isQuestionOrderArm(draft.orderArm)) return draft.orderArm;
  return hasProgress(draft) ? "control" : freshArm;
}

/** What a saved draft holds that decides its order. */
type DraftOrder = {
  orderArm?: unknown;
  currentIndex: number;
  answers: Readonly<Record<string, unknown>>;
  prefilled: readonly string[];
};

/** A move past the first question, or an answer that is not the landing card's prefill. */
function hasProgress(draft: DraftOrder): boolean {
  return (
    draft.currentIndex > 0 ||
    Object.keys(draft.answers).some((qId) => !draft.prefilled.includes(qId))
  );
}

/**
 * Whether a run opened over this draft begins now rather than at the draft's date: a fresh run
 * (as above) dated before the test's end. That is a landing card answered back then, or a draft
 * left untouched since before C13. It is asked the new order, but the server stamps a run's order
 * from its start (questionOrderArmAt), so under its old date about half of them would be stamped
 * with the arm their session drew. `useSurveyState` moves such a run's start to now.
 */
export function beginsNow(draft: DraftOrder & { startedAt: string }): boolean {
  return (
    !isQuestionOrderArm(draft.orderArm) &&
    !hasProgress(draft) &&
    Date.parse(draft.startedAt) < Date.parse(QUESTION_ORDER_TEST_END)
  );
}
