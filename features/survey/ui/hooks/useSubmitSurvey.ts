"use client";

import { useState, useCallback } from "react";
import posthog from "posthog-js";
import { surveyQuestions } from "@/data/survey-data";
import { getCsrfToken } from "@shared/http/csrf-client";
import type { SurveyAnswers } from "@features/survey/server/types";
import { getSurveyContactInfo } from "@features/survey/server/utils";
import type { AnswerValue } from "./useSurveyState";
import { getSessionId, setReportSessionId } from "./surveySession";
import {
  clearPendingCompletion,
  loadPendingCompletion,
  savePendingCompletion,
  type PendingSurveyCompletion,
} from "./surveyStorage";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

/**
 * PostHog's `$session_id` for the session that just filled in the survey, so the
 * Slack notification can link straight to the replay of it.
 *
 * Read here rather than server-side because it exists only in the browser, and at
 * submit time rather than on mount because the session id can roll over (PostHog
 * starts a new session after 30 minutes idle) and the id that matters is the one
 * covering the moment they finished.
 *
 * Wrapped: `get_session_id()` throws if PostHog never initialised — which is the
 * normal case when the project token is unset, and also what an ad blocker leaves
 * behind. A missing recording link is a missing row in a Slack message, so it must
 * never be able to fail a submission.
 */
function posthogSessionId(): string | null {
  try {
    const id = posthog.get_session_id();
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function useSubmitSurvey() {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [reportToken, setReportTokenState] = useState<string | null>(null);
  // Captured from the /api/survey response so SurveyEngine can pre-set the
  // analytics submission context (window.__loveiqReportSubmissionId) BEFORE
  // PreReportWizard mounts. Without this, wizard_slide_advanced events silently
  // skip durable persistence — see persistAnalyticsEvent in features/analytics/client.ts.
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [pendingCompletion, setPendingCompletion] = useState<PendingSurveyCompletion | null>(() =>
    loadPendingCompletion()
  );

  const syncPendingCompletion = useCallback((payload: PendingSurveyCompletion | null) => {
    setPendingCompletion(payload);
    if (payload) {
      savePendingCompletion(payload);
    } else {
      clearPendingCompletion();
    }
  }, []);

  const saveCompletionSnapshot = useCallback((payload: PendingSurveyCompletion) => {
    void fetch("/api/survey-partial", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      keepalive: true,
      body: JSON.stringify({
        sessionId: payload.sessionId,
        answers: payload.answers,
        currentIndex: payload.currentIndex,
        startedAt: payload.startedAt,
        ...(payload.utmTracker ? { utmTracker: payload.utmTracker } : {}),
      }),
    }).catch(() => {
      // Best-effort recovery snapshot.
    });
  }, []);

  const submitPayload = useCallback(
    async (payload: PendingSurveyCompletion) => {
      if (status === "submitting") return;

      setStatus("submitting");

      // Read once: two calls could straddle a PostHog session rollover.
      const replaySessionId = posthogSessionId();

      try {
        const res = await fetch("/api/survey", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            email: payload.email,
            firstName: payload.firstName,
            answers: payload.answers,
            startedAt: payload.startedAt,
            durationMs: payload.durationMs,
            ...(payload.utmTracker ? { utmTracker: payload.utmTracker } : {}),
            ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
            ...(replaySessionId ? { posthogSessionId: replaySessionId } : {}),
          }),
        });

        if (res.ok) {
          setReportSessionId(payload.sessionId);
          try {
            const json = (await res.json()) as {
              reportToken?: string;
              submissionId?: number;
            };
            if (json.reportToken) {
              setReportTokenState(json.reportToken);
            }
            // submissionId is required for wizard-slide analytics persistence;
            // type-guard against legacy / unexpected response shapes.
            if (typeof json.submissionId === "number" && json.submissionId > 0) {
              setSubmissionId(json.submissionId);
            }
          } catch {
            /* token extraction is best-effort */
          }
          syncPendingCompletion(null);
          // Identify BEFORE the capture below, so survey_completed is already
          // attributed. distinct_id is the lower-cased email, which is exactly
          // what the server-side purchase uses (features/analytics/server/posthog.ts)
          // — otherwise the Stripe-webhook purchase would land on an orphan
          // person and no funnel could join browsing to revenue.
          if (payload.email) {
            const identity = payload.email.trim().toLowerCase();
            posthog.identify(identity, {
              email: identity,
              ...(payload.firstName ? { first_name: payload.firstName } : {}),
            });
          }
          posthog.capture("survey_completed", {
            duration_ms: payload.durationMs,
            total_questions: surveyQuestions.length,
          });
          setStatus("success");
          return;
        }

        setStatus("error");
      } catch {
        setStatus("error");
      }
    },
    [status, syncPendingCompletion]
  );

  const submit = useCallback(
    async (answers: Record<string, AnswerValue>, startedAt: string, utmTracker?: string | null) => {
      if (status === "submitting") return;

      const { email, firstName } = getSurveyContactInfo(answers as SurveyAnswers);

      if (!email) {
        setStatus("error");
        return;
      }

      const payload: PendingSurveyCompletion = {
        sessionId: getSessionId(),
        email,
        firstName,
        answers: answers as SurveyAnswers,
        startedAt,
        durationMs: Date.now() - new Date(startedAt).getTime(),
        utmTracker: utmTracker ?? null,
        currentIndex: surveyQuestions.length,
        savedAt: new Date().toISOString(),
      };

      syncPendingCompletion(payload);
      saveCompletionSnapshot(payload);
      await submitPayload(payload);
    },
    [saveCompletionSnapshot, status, submitPayload, syncPendingCompletion]
  );

  const retryPending = useCallback(async () => {
    if (status === "submitting") return;

    const payload = pendingCompletion ?? loadPendingCompletion();
    if (!payload) {
      setStatus("error");
      return;
    }

    syncPendingCompletion(payload);
    saveCompletionSnapshot(payload);
    await submitPayload(payload);
  }, [pendingCompletion, saveCompletionSnapshot, status, submitPayload, syncPendingCompletion]);

  return {
    submit,
    retryPending,
    clearPendingCompletion: () => syncPendingCompletion(null),
    hasPendingCompletion: !!pendingCompletion,
    reportToken,
    submissionId,
    status,
  };
}
