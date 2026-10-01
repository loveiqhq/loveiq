"use client";

import { useCallback, useRef, useState } from "react";
import { trackChapterFeedbackSubmitted } from "@features/analytics/client";
import { getCsrfToken } from "@shared/http/csrf-client";

type FeedbackValue = "up" | "down" | null;

export interface FeedbackPayload {
  feedback: "up" | "down";
  comment?: string;
  issue?: string;
}

/**
 * "Does this resonate?" — one row per section in report_section_feedback.
 *
 * Since review 01.10 (Marcus: "Let's not force users to store a message when rating.
 * Ergo store the rating also without 'send'") the thumb stores the rating on its own
 * (`rateSection`), and Send adds the optional message to the same row
 * (`submitFeedback`): the route upserts on (submission, section) and only writes a
 * comment or an issue when one is sent, so neither post erases the other.
 *
 * Both resolve to whether the server stored it, so the widget never says "sent" for a
 * refused post (it did, for the five sections the route did not know). A refused
 * rating is taken back.
 */
export function useSectionFeedback(sessionId: string | null, token?: string | null) {
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackValue>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  // The saved ratings as of the last write, read where an updater's timing would not do.
  const latest = useRef<Record<string, FeedbackValue>>({});

  const remember = useCallback((sectionId: string, value: FeedbackValue) => {
    latest.current = { ...latest.current, [sectionId]: value };
    setFeedbacks((current) => ({ ...current, [sectionId]: value }));
  }, []);

  // Either identifier is enough — the API resolves the user server-side. Without both
  // (the staging preview), there is nothing to store against.
  const canStore = Boolean(sessionId || token);

  const post = useCallback(
    async (sectionId: string, payload: FeedbackPayload) => {
      try {
        const response = await fetch("/api/report-feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            ...payload,
            sectionId,
            ...(sessionId ? { sessionId } : {}),
            ...(token ? { token } : {}),
          }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    [sessionId, token]
  );

  /** The thumb: stores the rating alone. Resolves to whether it was stored. */
  const rateSection = useCallback(
    async (sectionId: string, feedback: "up" | "down") => {
      const previous = latest.current[sectionId] ?? null;
      remember(sectionId, feedback);
      if (!canStore) return true;
      // Analytics (non-PII) BEFORE the fetch, so the signal survives a failed call.
      trackChapterFeedbackSubmitted({
        section_id: sectionId,
        feedback,
        has_comment: false,
        step: "rating",
      });
      const stored = await post(sectionId, { feedback });
      if (!stored) remember(sectionId, previous);
      return stored;
    },
    [canStore, post, remember]
  );

  /** Send: the rating with its optional issue and comment, onto the same row. */
  const submitFeedback = useCallback(
    async (sectionId: string, payload: FeedbackPayload) => {
      if (!canStore) return true;
      trackChapterFeedbackSubmitted({
        section_id: sectionId,
        feedback: payload.feedback,
        issue: payload.issue,
        has_comment: Boolean(payload.comment && payload.comment.trim().length > 0),
        step: "message",
      });
      const stored = await post(sectionId, payload);
      if (stored) {
        remember(sectionId, payload.feedback);
        setSubmitted((current) => ({ ...current, [sectionId]: true }));
      }
      return stored;
    },
    [canStore, post, remember]
  );

  return { feedbacks, submitted, rateSection, submitFeedback };
}
