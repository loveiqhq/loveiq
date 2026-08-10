import { surveyQuestions } from "@/data/survey-data";
import type { SurveyAnswers, SurveyAnswerValue } from "./types";

export const SURVEY_TOTAL_QUESTIONS = surveyQuestions.length;

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
  // admin recovery list. Having answered everything is the real signal.
  const reachedEnd =
    currentIndex >= SURVEY_TOTAL_QUESTIONS || countSurveyAnswers(answers) >= SURVEY_TOTAL_QUESTIONS;
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
