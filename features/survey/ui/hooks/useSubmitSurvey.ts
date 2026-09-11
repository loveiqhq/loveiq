"use client";

import { useState, useCallback } from "react";
import posthog from "posthog-js";
import { surveyQuestions } from "@/data/survey-data";
import { getCsrfToken } from "@shared/http/csrf-client";
import type { SurveyAnswers } from "@features/survey/server/types";
import { getSurveyContactInfo } from "@features/survey/server/utils";
import type { AnswerValue } from "./useSurveyState";
import { isRandomised } from "@features/survey/questionFlags";
import { orderedOptions } from "../questionOrder";
import { getSessionId, setReportSessionId } from "./surveySession";
import {
  clearPendingCompletion,
  loadPendingCompletion,
  savePendingCompletion,
  type PendingSurveyCompletion,
} from "./surveyStorage";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

/**
 * The order this respondent was shown the options in, for every randomised question
 * they answered — `{ "<qId>": ["<option text>", ...] }`.
 *
 * Recomputed here rather than reported up from the question components. `orderedOptions`
 * is deterministic given (question, sessionId) and the components derive their order the
 * same way, so recomputing yields exactly what was on screen without threading render
 * state through the engine. If the session id is unavailable (storage blocked — see
 * `getSessionId`) the components could not have shuffled either, so an empty map is the
 * honest answer rather than a fabricated order.
 */
function buildOptionOrder(
  answers: Record<string, AnswerValue>,
  sessionId: string | undefined
): Record<string, string[]> {
  const shown: Record<string, string[]> = {};
  if (!sessionId) return shown;

  for (const question of surveyQuestions) {
    if (!isRandomised(question.qId)) continue;
    if (answers[question.qId] === undefined) continue; // never shown, or skipped
    shown[question.qId] = orderedOptions(question, sessionId);
  }
  return shown;
}

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
      const optionOrder = buildOptionOrder(payload.answers, payload.sessionId);

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
            ...(Object.keys(optionOrder).length > 0 ? { optionOrder } : {}),
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
          /**
           * Identify on submit. distinct_id is the lower-cased email, which is
           * exactly what the server-side purchase uses
           * (features/analytics/server/posthog.ts) — otherwise the
           * Stripe-webhook purchase would land on an orphan person and no
           * funnel could join browsing to revenue.
           *
           * There used to be a `posthog.capture("survey_completed")` directly
           * below this, added so the event landed AFTER the identify. But
           * `SurveyEngine` already reports completion through
           * `trackSurveyComplete`, so every completion was counted TWICE:
           * measured at 2.06 events per session, 209 of 218 sessions firing a
           * pair 30-95ms apart (the gap being this path recomputing its own
           * duration). Server-side truth was singular the whole time — 79
           * `direction=complete` rows across 79 sessions.
           *
           * Removing it costs nothing, because `identify` merges the
           * anonymous person into the identified one and carries this
           * session's earlier events with it. The engine's call also reaches
           * GA4, which a bare `posthog.capture` never did.
           */
          if (payload.email) {
            const identity = payload.email.trim().toLowerCase();
            posthog.identify(identity, {
              email: identity,
              ...(payload.firstName ? { first_name: payload.firstName } : {}),
            });
          }
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
