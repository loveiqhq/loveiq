"use client";

import { useState, useCallback } from "react";
import type { AnswerValue } from "./useSurveyState";
import { getCsrfToken } from "@/lib/csrf-client";
import { getSessionId } from "./surveySession";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

export function useSubmitSurvey() {
  const [status, setStatus] = useState<SubmitStatus>("idle");

  const submit = useCallback(
    async (answers: Record<string, AnswerValue>, startedAt: string, utmTracker?: string | null) => {
      if (status === "submitting") return;

      const email = (answers["00000"] as string | undefined)?.trim().toLowerCase();
      const firstName = (answers["00001"] as string | undefined)?.trim() || "";

      if (!email) {
        setStatus("error");
        return;
      }

      setStatus("submitting");

      const durationMs = Date.now() - new Date(startedAt).getTime();
      const sessionId = getSessionId();

      try {
        const res = await fetch("/api/survey", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            email,
            firstName,
            answers,
            startedAt,
            durationMs,
            ...(utmTracker ? { utmTracker } : {}),
            ...(sessionId ? { sessionId } : {}),
          }),
        });

        setStatus(res.ok ? "success" : "error");
      } catch {
        setStatus("error");
      }
    },
    [status]
  );

  return { submit, status };
}
