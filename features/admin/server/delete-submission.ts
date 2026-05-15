/**
 * Reusable cascade for deleting a survey_submission and all dependent rows.
 *
 * PostgREST doesn't support subqueries inside `in.()`, so we fetch ids first
 * then delete in dependency order:
 *
 *   answer_options junction
 *     → answer_history
 *       → answers
 *         → scoring_result
 *         → analytics_event
 *           → survey_submission
 *
 * Returns a structured result so callers (single + bulk) can branch on the
 * "blocked because a paid report exists" case without re-implementing the
 * guard.
 */

import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

export type DeleteSubmissionResult =
  | { ok: true }
  | { ok: false; reason: "personal_report_exists" | "delete_failed"; status: number };

export async function deleteSubmissionCascade(numericId: number): Promise<DeleteSubmissionResult> {
  // Guard: a paid/issued report makes the submission too valuable to cascade.
  const reportCheck = await supabaseFetch(
    `/rest/v1/personal_report?survey_submission_id=eq.${numericId}&select=id&limit=1`
  );
  if (reportCheck.ok) {
    const reports = (await reportCheck.json()) as Array<{ id: number }>;
    if (reports.length > 0) {
      return { ok: false, reason: "personal_report_exists", status: 409 };
    }
  }

  const answerIdsRes = await supabaseFetch(
    `/rest/v1/survey_submission_answer?survey_submission_id=eq.${numericId}&select=id`
  );
  const answerIds = answerIdsRes.ok
    ? ((await answerIdsRes.json()) as Array<{ id: number }>).map((a) => a.id)
    : [];

  if (answerIds.length > 0) {
    await supabaseFetch(
      `/rest/v1/survey_submission_answer_options?survey_submission_answer_id=in.(${answerIds.join(",")})`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    ).catch(() => {});

    await supabaseFetch(
      `/rest/v1/survey_submission_answer_history?survey_submission_answer_id=in.(${answerIds.join(",")})`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    ).catch(() => {});
  }

  const answersRes = await supabaseFetch(
    `/rest/v1/survey_submission_answer?survey_submission_id=eq.${numericId}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
  if (!answersRes.ok) {
    logger.error({ submissionId: numericId, status: answersRes.status }, "Delete answers failed");
    return { ok: false, reason: "delete_failed", status: 500 };
  }

  await supabaseFetch(`/rest/v1/scoring_result?survey_submission_id=eq.${numericId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});

  await supabaseFetch(`/rest/v1/analytics_event?survey_submission_id=eq.${numericId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {});

  const subRes = await supabaseFetch(`/rest/v1/survey_submission?id=eq.${numericId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  if (!subRes.ok) {
    logger.error({ submissionId: numericId, status: subRes.status }, "Delete submission failed");
    return { ok: false, reason: "delete_failed", status: 500 };
  }

  return { ok: true };
}

export async function deletePartialBySessionId(sessionId: string): Promise<DeleteSubmissionResult> {
  const res = await supabaseFetch(
    `/rest/v1/survey_partial_save?session_id=eq.${encodeURIComponent(sessionId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
  if (!res.ok) {
    logger.error({ sessionId, status: res.status }, "Delete partial failed");
    return { ok: false, reason: "delete_failed", status: 500 };
  }
  return { ok: true };
}
