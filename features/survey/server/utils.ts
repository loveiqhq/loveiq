import { surveyQuestions } from "@/data/survey-data";
import { isHidden } from "@features/survey/questionFlags";
import type { SurveyAnswers, SurveyAnswerValue } from "./types";

/**
 * How many questions a respondent is actually asked.
 *
 * Hidden questions are excluded deliberately, and this is the load-bearing half of
 * hiding one: `isCompletionReady` below tests `answerCount >= SURVEY_TOTAL_QUESTIONS`, so
 * counting a question nobody is shown would wait forever for an answer that cannot
 * arrive, and no survey would ever register as complete.
 */
export const SURVEY_TOTAL_QUESTIONS = surveyQuestions.filter((q) => !isHidden(q.qId)).length;

/**
 * Questions a respondent may leave blank: `required: false` in the survey data, which
 * `scripts/update-survey.js` derives from guidance copy that begins "Optional". Today that
 * is Mark's two content asks, 16019 and 16020.
 */
const OPTIONAL_QIDS: ReadonlySet<string> = new Set(
  surveyQuestions.filter((q) => !q.required).map((q) => q.qId)
);

/**
 * How many asked questions must be answered before a draft counts as finished.
 *
 * `SURVEY_TOTAL_QUESTIONS` still counts the optional ones, because it is what "Question X of
 * N" shows. Completion cannot wait on them: a respondent who skipped both content asks has
 * finished, and counting the asks would keep them off the admin recovery list.
 */
const SURVEY_REQUIRED_QUESTIONS = surveyQuestions.filter(
  (q) => !isHidden(q.qId) && !OPTIONAL_QIDS.has(q.qId)
).length;

/** Answers that count toward completion: everything except `_other` text and optional asks. */
function countRequiredAnswers(answers: SurveyAnswers): number {
  return Object.keys(answers).filter((key) => !key.endsWith("_other") && !OPTIONAL_QIDS.has(key))
    .length;
}

/**
 * `answers` without optional answers that say nothing.
 *
 * A respondent who types into an optional box and then clears it leaves `""` behind, and
 * `submit_survey` would store that as an empty `answer_text` row that reads as answered.
 * Dropped here, at the trust boundary, before anything counts, scores or stores the
 * answers. Required questions are never touched: what their blanks mean is not this
 * function's call.
 */
export function dropBlankOptionalAnswers<T extends Record<string, unknown>>(answers: T): T {
  const kept = Object.entries(answers).filter(
    ([qId, value]) => !(OPTIONAL_QIDS.has(qId) && typeof value === "string" && !value.trim())
  );
  return Object.fromEntries(kept) as T;
}

/**
 * Question id → how many options may be selected, for the questions that cap.
 *
 * The cap is authored as ordinary guidance copy ("Select up to two options.") and parsed
 * out by `scripts/update-survey.js`, so this map follows the survey data rather than
 * restating it — a cap changed in the CSV takes effect here without a code edit.
 *
 * Exists so the API can enforce the same limit the UI does. The client already blocks the
 * extra pick, so this is a guard against a modified client, not a path real users reach.
 */
export const SURVEY_SELECTION_CAPS: ReadonlyMap<string, number> = new Map(
  surveyQuestions
    .filter((q): q is typeof q & { maxSelections: number } => typeof q.maxSelections === "number")
    .map((q) => [q.qId, q.maxSelections])
);

export function countSurveyAnswers(answers: SurveyAnswers): number {
  return Object.keys(answers).filter((key) => !key.endsWith("_other")).length;
}

export function normalizeSurveyEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeSurveyFirstName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getSurveyContactInfo(answers: SurveyAnswers) {
  return {
    email: normalizeSurveyEmail(answers["00000"]),
    firstName: normalizeSurveyFirstName(answers["00001"]),
  };
}

export function parseUtmSource(tracker: string | null): string | null {
  if (!tracker?.trim()) return null;
  try {
    const parsed = JSON.parse(tracker);
    return typeof parsed.utm_source === "string" && parsed.utm_source.trim()
      ? parsed.utm_source.trim()
      : null;
  } catch {
    return tracker.trim();
  }
}

export function isCompletionReady(currentIndex: number, answers: SurveyAnswers): boolean {
  // Also count-based, not index-only: a question answered on the landing page is
  // dropped from the survey flow, so those visitors finish with `currentIndex`
  // one short of the total. Judging by index alone would hide them from the
  // admin recovery list. Having answered every REQUIRED question is the real
  // signal; the optional content asks may be skipped.
  const reachedEnd =
    currentIndex >= SURVEY_TOTAL_QUESTIONS ||
    countRequiredAnswers(answers) >= SURVEY_REQUIRED_QUESTIONS;
  return reachedEnd && normalizeSurveyEmail(answers["00000"]).length > 0;
}

export function mergeSavedAnswerValue(
  value: SurveyAnswerValue | undefined,
  otherValue: SurveyAnswerValue | undefined
): SurveyAnswerValue | null {
  const otherText = typeof otherValue === "string" ? otherValue.trim() : "";
  if (value === undefined || value === null) {
    return otherText || null;
  }

  if (Array.isArray(value)) {
    return otherText ? [...value, otherText] : value;
  }

  if (typeof value === "string") {
    if (!otherText) return value;
    return /^other\b/i.test(value) ? otherText : `${value} - ${otherText}`;
  }

  return value;
}
