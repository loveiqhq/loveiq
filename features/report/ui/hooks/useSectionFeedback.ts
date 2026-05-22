"use client";

import { startTransition, useCallback, useState } from "react";
import { trackChapterFeedbackSubmitted } from "@features/analytics/client";
import { getCsrfToken } from "@shared/http/csrf-client";

type FeedbackValue = "up" | "down" | null;

export interface FeedbackPayload {
  feedback: "up" | "down";
  comment?: string;
  issue?: string;
}

export function useSectionFeedback(sessionId: string | null, token?: string | null) {
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackValue>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  const submitFeedback = useCallback(
    async (sectionId: string, payload: FeedbackPayload) => {
      // Either identifier is enough — the API resolves the user server-side.
      // Bailing only when both are missing prevents silent feedback loss when
      // sessionStorage is cleared between survey and report viewing (e.g. user
      // clicks the report email link on a different device).
      if (!sessionId && !token) return;

      startTransition(() => {
        setFeedbacks((current) => ({ ...current, [sectionId]: payload.feedback }));
        setSubmitted((current) => ({ ...current, [sectionId]: true }));
      });

      // Fire analytics (non-PII: feedback + issue + has_comment boolean, never
      // the comment text itself) BEFORE the fetch so we still get the signal
      // even if the network call fails.
      trackChapterFeedbackSubmitted({
        section_id: sectionId,
        feedback: payload.feedback,
        issue: payload.issue,
        has_comment: Boolean(payload.comment && payload.comment.trim().length > 0),
      });

      try {
        const csrfToken = getCsrfToken();
        await fetch("/api/report-feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            ...payload,
            sectionId,
            ...(sessionId ? { sessionId } : {}),
            ...(token ? { token } : {}),
          }),
        });
      } catch {
        startTransition(() => {
          setSubmitted((current) => ({ ...current, [sectionId]: false }));
        });
      }
    },
    [sessionId, token]
  );

  return { feedbacks, submitted, submitFeedback };
}
