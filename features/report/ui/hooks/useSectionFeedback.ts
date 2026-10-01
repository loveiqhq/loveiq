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
 *
 * A rating switched within a post's round trip (final review, 01.10): a section's posts
 * go out one after the other, in click order, so its row ends on the last click; a result
 * that lands after a newer click changes nothing on screen (it resolves true: nothing to
 * take back); and a refused latest rating goes back to the last value the server stored.
 */
export function useSectionFeedback(sessionId: string | null, token?: string | null) {
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackValue>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  // Per section: the newest action's number, the value the server last stored, and the
  // posts in flight, chained so they reach the route in click order.
  const actions = useRef<Record<string, number>>({});
  const confirmed = useRef<Record<string, FeedbackValue>>({});
  const queue = useRef<Record<string, Promise<unknown>>>({});

  const show = useCallback((sectionId: string, value: FeedbackValue) => {
    setFeedbacks((current) => ({ ...current, [sectionId]: value }));
  }, []);

  /** A new action on the section; its number says whether it is still the newest. */
  const begin = useCallback((sectionId: string) => {
    const action = (actions.current[sectionId] ?? 0) + 1;
    actions.current[sectionId] = action;
    return action;
  }, []);
  const isNewest = (sectionId: string, action: number) => actions.current[sectionId] === action;

  /** Runs `task` after every earlier post for the section has settled. */
  const enqueue = useCallback((sectionId: string, task: () => Promise<boolean>) => {
    const run = (queue.current[sectionId] ?? Promise.resolve()).then(task);
    queue.current[sectionId] = run.catch(() => undefined);
    return run;
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
      const action = begin(sectionId);
      show(sectionId, feedback);
      if (!canStore) return true;
      // Analytics (non-PII) BEFORE the fetch, so the signal survives a failed call.
      trackChapterFeedbackSubmitted({
        section_id: sectionId,
        feedback,
        has_comment: false,
        step: "rating",
      });
      const stored = await enqueue(sectionId, () => post(sectionId, { feedback }));
      if (stored) confirmed.current[sectionId] = feedback;
      // A newer click owns the section now.
      if (!isNewest(sectionId, action)) return true;
      if (!stored) show(sectionId, confirmed.current[sectionId] ?? null);
      return stored;
    },
    [begin, canStore, enqueue, post, show]
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
      const action = begin(sectionId);
      const stored = await enqueue(sectionId, () => post(sectionId, payload));
      if (stored) {
        confirmed.current[sectionId] = payload.feedback;
        setSubmitted((current) => ({ ...current, [sectionId]: true }));
      }
      // Shown: what the server now holds, unless a newer click owns the section.
      if (isNewest(sectionId, action)) {
        show(sectionId, stored ? payload.feedback : (confirmed.current[sectionId] ?? null));
      }
      return stored;
    },
    [begin, canStore, enqueue, post, show]
  );

  return { feedbacks, submitted, rateSection, submitFeedback };
}
