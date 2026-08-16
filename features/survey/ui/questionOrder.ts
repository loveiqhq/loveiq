import type { SurveyQuestion } from "@/data/survey-data";

/** The email-capture question. Asked at the END of the flow — see below. */
export const EMAIL_QID = "00000";
/** The marketing opt-in. Stays the final question; email sits right before it. */
export const OPT_IN_QID = "16015";

/**
 * Move the email question to the end of the survey.
 *
 * `data/survey-data.ts` is generated in qId order (`scripts/update-survey.js`
 * sorts by qId), which puts email at index 0. We ask it last instead: the
 * question lands immediately BEFORE the marketing opt-in, which stays the final
 * question.
 *
 * This was a 50/50 A/B ("first" vs "last", `survey-email-position-ab`) until
 * 2026-08-16, when "last" shipped to everyone and the arm/cookie/stamping was
 * removed. Kept as a render-time reorder rather than a data change because the
 * generator's qId sort would undo any row move in `data/survey-source.csv`.
 *
 * Pure: length and the relative order of every other question are preserved,
 * and the email question appears exactly once.
 */
export function orderEmailLast(questions: SurveyQuestion[]): SurveyQuestion[] {
  const email = questions.find((q) => q.qId === EMAIL_QID);
  if (!email) return questions; // defensive: nothing to move

  const rest = questions.filter((q) => q.qId !== EMAIL_QID);
  const optInIdx = rest.findIndex((q) => q.qId === OPT_IN_QID);
  if (optInIdx === -1) return [...rest, email]; // fallback: truly last

  return [...rest.slice(0, optInIdx), email, ...rest.slice(optInIdx)];
}
