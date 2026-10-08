/**
 * The email question test: today's question against Marcus's "anonymous" redesign
 * (Figma IdxyUUVvJSYRTpI9CYRtJI 11600:15119). A 50/50 split.
 *
 * WHY. The email question loses about 12% of the people who reach it, the most of any
 * question, and most of them leave without typing anything (Eman, 07.10). At the
 * 07.10 sync Marcus asked for "what's your email, feel free to use an anonymous one"
 * as an A/B test against the current question; Fatih chose to test the whole frame:
 * the new title, help text and placeholder, and one underline input with no confirm
 * box.
 *
 * HOW THE ARM IS DRAWN. Like C13 (`questionOrderArm.ts`), from the survey session
 * id, salted with this experiment's name: stable across reloads and back-navigation,
 * nothing to mint or retire, and recomputable for every stored session, including
 * the drop-offs, because `survey_partial_save` and `survey_submission` both keep the
 * session id. The salt makes the split independent of C13's, which runs on the same
 * sessions. No session id means control, though in a browser there always is one: where
 * storage is blocked, `getSessionId` makes a new id on every page load, so those
 * respondents are drawn afresh on each load and stamped with that load's arm.
 *
 * READING THE RESULT: FILTER BY START DATE, ALWAYS. The arm is a pure function of the
 * session id, so it returns an arm for every session ever recorded, including all
 * the ones that saw only today's question. C13's notes measured what an unfiltered
 * readout does: a confident 10.5-point "win" for people who never saw a variant.
 */

import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import { sessionArmHash } from "@shared/experiments/sessionHash";

export type EmailQuestionArm = "control" | "anonymous";

/** The experiment's name in analytics and its salt. */
export const EMAIL_QUESTION_EXPERIMENT = "survey-email-anonymous";

/**
 * The arm's key in `utm_tracker` (`survey_submission`, `survey_partial_save`), and its
 * name on PostHog and GA4. Not "email_question_arm": the admin's UTM filter matches any
 * substring of the tracker (`utm_tracker ILIKE '%' || filter || '%'`), and "email" is a
 * source our own links carry, so that key would have matched the filter on every stamped
 * row. "Contact", because the question asks how to contact them.
 */
export const EMAIL_QUESTION_ARM_KEY = "contact_question_arm";

export function isEmailQuestionArm(value: unknown): value is EmailQuestionArm {
  return value === "control" || value === "anonymous";
}

/**
 * Preview override: `?email=control` or `?email=anonymous` on `/survey`, so either arm
 * can be inspected on dev and staging. Null on production, where it must never
 * influence a real respondent's arm, the same guard `?order=` has.
 */
export function resolveEmailQuestionOverride(
  param: string | null | undefined
): EmailQuestionArm | null {
  if (!isNonProdDeploy()) return null;
  return isEmailQuestionArm(param) ? param : null;
}

/**
 * This session's arm. Pure, deterministic and total: the same session id always
 * returns the same arm, and an absent one always returns control.
 */
export function assignEmailQuestionArm(sessionId: string | null | undefined): EmailQuestionArm {
  if (!sessionId?.trim()) return "control";
  return sessionArmHash(`${EMAIL_QUESTION_EXPERIMENT}:${sessionId}`) % 2 === 0
    ? "control"
    : "anonymous";
}
