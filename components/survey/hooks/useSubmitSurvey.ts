"use client";

import { useState, useCallback } from "react";
import { surveyQuestions } from "@/data/survey-data";
import { getCsrfToken } from "@/lib/csrf-client";
import type { SurveyAnswers } from "@/lib/survey/types";
import { getSurveyContactInfo } from "@/lib/survey/utils";
import type { AnswerValue } from "./useSurveyState";
import { getSessionId } from "./surveySession";
import {
  clearPendingCompletion,
  loadPendingCompletion,
  savePendingCompletion,
  type PendingSurveyCompletion,
} from "./surveyStorage";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

export function useSubmitSurvey() {
  const [status, setStatus] = useState<SubmitStatus>("idle");
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
          }),
        });

        if (res.ok) {
          syncPendingCompletion(null);
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
    status,
  };
}
