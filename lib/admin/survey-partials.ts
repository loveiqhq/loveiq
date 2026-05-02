import { surveyQuestions } from "@/data/survey-data";
import type { SurveyAnswers, SurveyAnswerValue } from "@/lib/survey/types";
import {
  SURVEY_TOTAL_QUESTIONS,
  countSurveyAnswers,
  getSurveyContactInfo,
  isCompletionReady,
  mergeSavedAnswerValue,
  parseUtmSource,
} from "@/lib/survey/utils";

export interface SurveyPartialRow {
  id: number;
  session_id: string;
  answers: Record<string, unknown> | null;
  current_index: number;
  started_at: string | null;
  saved_at: string;
  utm_tracker: string | null;
}

function sanitizeAnswers(answers: Record<string, unknown> | null): SurveyAnswers {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return {};
  }

  const entries = Object.entries(answers).filter(([, value]) => {
    return (
      typeof value === "string" ||
      typeof value === "number" ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"))
    );
  }) as Array<[string, SurveyAnswerValue]>;

  return Object.fromEntries(entries);
}

function priorityLabel(score: number): "high" | "medium" | "low" {
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

export function buildPartialSubmissionRecord(row: SurveyPartialRow) {
  const answers = sanitizeAnswers(row.answers);
  const { email, firstName } = getSurveyContactInfo(answers);
  const recoverable = isCompletionReady(row.current_index, answers);
  const answerCount = countSurveyAnswers(answers);
  const durationMs = row.started_at
    ? Math.max(0, new Date(row.saved_at).getTime() - new Date(row.started_at).getTime())
    : null;
  const progressPercent =
    SURVEY_TOTAL_QUESTIONS > 0 ? Math.round((answerCount / SURVEY_TOTAL_QUESTIONS) * 100) : 0;
  const score = recoverable
    ? 85
    : Math.min(55, Math.round(progressPercent * 0.45) + Math.min(row.current_index, 10));

  const reviewReasons = [
    recoverable ? "Ready to recover" : `${answerCount} answers saved`,
    row.current_index > 0
      ? `Stopped near Q${Math.min(row.current_index, SURVEY_TOTAL_QUESTIONS)}`
      : "Started survey",
  ];

  return {
    id: `partial:${row.session_id}`,
    record_type: "partial" as const,
    submission_id: null,
    session_id: row.session_id,
    email,
    first_name: firstName,
    status: recoverable ? "pending_completion" : "partial",
    started_at: row.started_at || row.saved_at,
    completed_at: row.saved_at,
    saved_at: row.saved_at,
    duration_ms: durationMs,
    utm_source: parseUtmSource(row.utm_tracker),
    primary_archetype: null,
    v5_primary_archetype: null,
    priority_score: score,
    priority_label: priorityLabel(score),
    review_reasons: reviewReasons,
    answer_count: answerCount,
    current_index: row.current_index,
    recoverable,
    detail_href: `/admin/submissions/partial/${encodeURIComponent(row.session_id)}`,
    selectable: false,
  };
}

export function buildPartialAnswerDetails(rawAnswers: Record<string, unknown> | null) {
  const answers = sanitizeAnswers(rawAnswers);

  return surveyQuestions.flatMap((question) => {
    const mergedValue = mergeSavedAnswerValue(
      answers[question.qId],
      answers[`${question.qId}_other`]
    );

    if (mergedValue === null) return [];

    return [
      {
        q_id: question.qId,
        question_text: question.question,
        answer_type: question.answerType,
        answer_value: mergedValue,
        time_spent_seconds: null,
        revision_count: null,
        was_skipped: false,
      },
    ];
  });
}
