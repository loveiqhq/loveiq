"use client";

import { startTransition, useCallback, useState } from "react";
import { getCsrfToken } from "@/lib/csrf-client";

type FeedbackValue = "up" | "down" | null;

export function useSectionFeedback(sessionId: string | null) {
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackValue>>({});

  const submitFeedback = useCallback(
    async (sectionId: string, feedback: "up" | "down") => {
      if (!sessionId) return;

      let previousValue: FeedbackValue = null;

      startTransition(() => {
        setFeedbacks((current) => {
          previousValue = current[sectionId] ?? null;
          if (previousValue === feedback) return current;
          return { ...current, [sectionId]: feedback };
        });
      });

      if (previousValue === feedback) return;

      try {
        const csrfToken = getCsrfToken();
        await fetch("/api/report-feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({ feedback, sectionId, sessionId }),
        });
      } catch {
        startTransition(() => {
          setFeedbacks((current) => ({ ...current, [sectionId]: previousValue }));
        });
      }
    },
    [sessionId]
  );

  return { feedbacks, submitFeedback };
}
