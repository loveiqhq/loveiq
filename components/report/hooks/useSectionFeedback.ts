"use client";

import { startTransition, useCallback, useState } from "react";
import { getCsrfToken } from "@/lib/csrf-client";

type FeedbackValue = "up" | "down" | null;

export interface FeedbackPayload {
  feedback: "up" | "down";
  comment?: string;
  issue?: string;
}

export function useSectionFeedback(sessionId: string | null) {
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackValue>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  const submitFeedback = useCallback(
    async (sectionId: string, payload: FeedbackPayload) => {
      if (!sessionId) return;

      startTransition(() => {
        setFeedbacks((current) => ({ ...current, [sectionId]: payload.feedback }));
        setSubmitted((current) => ({ ...current, [sectionId]: true }));
      });

      try {
        const csrfToken = getCsrfToken();
        await fetch("/api/report-feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({ ...payload, sectionId, sessionId }),
        });
      } catch {
        startTransition(() => {
          setSubmitted((current) => ({ ...current, [sectionId]: false }));
        });
      }
    },
    [sessionId]
  );

  return { feedbacks, submitted, submitFeedback };
}
