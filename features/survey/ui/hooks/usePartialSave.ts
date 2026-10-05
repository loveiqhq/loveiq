"use client";

import { useEffect, useRef, useCallback } from "react";
import type { AnswerValue } from "./useSurveyState";
import { getSessionId } from "./surveySession";
import { getCsrfToken } from "@shared/http/csrf-client";

export function usePartialSave(
  answers: Record<string, AnswerValue>,
  currentIndex: number,
  startedAt: string,
  utmTracker: string | null,
  /**
   * The run went through. The abandon beacon used to fire on the way to the report (or on
   * any app switch during the screens after it) and re-saved every answer of a finished
   * run into survey_partial_save, the row the submit had just deleted.
   */
  submitted = false
) {
  const answersRef = useRef(answers);
  const currentIndexRef = useRef(currentIndex);
  const startedAtRef = useRef(startedAt);
  const utmTrackerRef = useRef(utmTracker);
  // Initialised eagerly during render. `getSessionId` catches storage that
  // THROWS (Safari private mode, some in-app WebViews) and falls back to an
  // in-memory id; before that, this line threw inside a render for those
  // visitors.
  const sessionIdRef = useRef(getSessionId());
  const beaconSentRef = useRef(false);
  const submittedRef = useRef(submitted);
  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);

  // Keep refs in sync
  useEffect(() => {
    answersRef.current = answers;
    currentIndexRef.current = currentIndex;
    startedAtRef.current = startedAt;
    utmTrackerRef.current = utmTracker;
  }, [answers, currentIndex, startedAt, utmTracker]);

  // Build payload from current refs
  const buildPayload = useCallback(() => {
    return {
      sessionId: sessionIdRef.current,
      answers: answersRef.current,
      currentIndex: currentIndexRef.current,
      startedAt: startedAtRef.current,
      ...(utmTrackerRef.current ? { utmTracker: utmTrackerRef.current } : {}),
    };
  }, []);

  // Regular fetch — used on forward navigation (page stays open)
  const savePartial = useCallback(() => {
    if (submittedRef.current) return;
    if (!sessionIdRef.current) return;
    // Skip if no answers yet
    if (Object.keys(answersRef.current).length === 0) return;

    // Reset beacon guard — page is still alive, allow future abandon beacons
    beaconSentRef.current = false;

    const payload = buildPayload();
    fetch("/api/survey-partial", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken(),
      },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Fire-and-forget — partial saves are best-effort
    });
  }, [buildPayload]);

  // sendBeacon — used on page unload / visibility hidden (for abandon)
  useEffect(() => {
    const handleAbandon = () => {
      if (document.visibilityState !== "hidden") return;
      if (beaconSentRef.current) return; // prevent double-fire (visibilitychange + pagehide)
      if (submittedRef.current) return;
      if (!sessionIdRef.current) return;
      if (Object.keys(answersRef.current).length === 0) return;

      beaconSentRef.current = true;

      const payload = {
        ...buildPayload(),
        _csrf: getCsrfToken(),
      };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon("/api/survey-partial", blob);
    };

    document.addEventListener("visibilitychange", handleAbandon);
    window.addEventListener("pagehide", handleAbandon);
    return () => {
      document.removeEventListener("visibilitychange", handleAbandon);
      window.removeEventListener("pagehide", handleAbandon);
    };
  }, [buildPayload]);

  return { savePartial };
}
