"use client";

import { useEffect, useRef, useCallback } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import { getCsrfToken } from "@/lib/csrf-client";
import { getSessionId } from "./surveySession";

interface TrackingEvent {
  sessionId: string;
  qId: string;
  chapter: string;
  questionIndex: number;
  timeSpentMs: number;
  answered: boolean;
  direction: "forward" | "back" | "abandon" | "complete";
  timestamp: string;
}

const FLUSH_SIZE = 5;
const FLUSH_INTERVAL_MS = 15_000;
const MAX_BUFFER_SIZE = 100;

export function useSurveyTracking(
  currentIndex: number,
  hasAnswer: boolean,
  question: SurveyQuestion | undefined
) {
  const sessionId = useRef("");
  const buffer = useRef<TrackingEvent[]>([]);
  const questionEnteredAt = useRef<number>(0);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentQuestionRef = useRef(question);
  const currentIndexRef = useRef(currentIndex);
  const hasAnswerRef = useRef(hasAnswer);

  // Keep refs in sync
  useEffect(() => {
    currentQuestionRef.current = question;
    currentIndexRef.current = currentIndex;
    hasAnswerRef.current = hasAnswer;
  }, [question, currentIndex, hasAnswer]);

  // Initialize session and timer
  useEffect(() => {
    sessionId.current = getSessionId();
    questionEnteredAt.current = performance.now();

    flushTimer.current = setInterval(() => {
      if (buffer.current.length > 0) {
        flushEvents(buffer.current.splice(0));
      }
    }, FLUSH_INTERVAL_MS);

    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
    };
  }, []);

  // Reset timer on question change
  useEffect(() => {
    questionEnteredAt.current = performance.now();
  }, [currentIndex]);

  // Visibility change / pagehide — send abandon event via sendBeacon
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const q = currentQuestionRef.current;
        if (!q) return;
        const timeSpentMs = Math.round(performance.now() - questionEnteredAt.current);
        const event: TrackingEvent = {
          sessionId: sessionId.current,
          qId: q.qId,
          chapter: q.chapter,
          questionIndex: currentIndexRef.current,
          timeSpentMs,
          answered: hasAnswerRef.current,
          direction: "abandon",
          timestamp: new Date().toISOString(),
        };
        const allEvents = [...buffer.current, event];
        buffer.current = [];
        const payload = JSON.stringify({ events: allEvents, _csrf: getCsrfToken() });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/survey-tracking", blob);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleVisibilityChange);
    };
  }, []);

  const trackNavigation = useCallback((direction: "forward" | "back" | "complete" | "abandon") => {
    const q = currentQuestionRef.current;
    if (!q || !sessionId.current) return;

    const timeSpentMs = Math.round(performance.now() - questionEnteredAt.current);
    const event: TrackingEvent = {
      sessionId: sessionId.current,
      qId: q.qId,
      chapter: q.chapter,
      questionIndex: currentIndexRef.current,
      timeSpentMs,
      answered: hasAnswerRef.current,
      direction,
      timestamp: new Date().toISOString(),
    };

    buffer.current.push(event);

    if (
      buffer.current.length >= FLUSH_SIZE ||
      direction === "complete" ||
      direction === "abandon"
    ) {
      const events = buffer.current.splice(0);
      flushEvents(events);
    }
  }, []);

  return { trackNavigation };
}

function flushEvents(events: TrackingEvent[]) {
  if (events.length === 0) return;

  fetch("/api/survey-tracking", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": getCsrfToken(),
    },
    body: JSON.stringify({ events }),
  }).catch(() => {
    // Fire-and-forget — analytics events may be lost on network failure
  });
}
