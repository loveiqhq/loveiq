"use client";

import { useSyncExternalStore } from "react";
import { trackLandingCardAnswer } from "@features/analytics/client";
import {
  LANDING_PREFILL_QID,
  SURVEY_STATE_KEY,
  saveLandingPrefill,
} from "@features/survey/ui/hooks/surveyStorage";

/**
 * Question 1's answer on a landing page: one value, wherever the page asks it (the video
 * page's hero and closing cards, the new page's hero question). It lives in the survey
 * draft, so SurveyEngine drops the question from the flow, and every card on the page
 * shows the same pick, a returning visitor's included.
 *
 * `useSyncExternalStore` rather than a mount effect: the server snapshot is null, so
 * hydration matches and there is no setState-in-effect (which this repo lints as an error).
 */
const pickListeners = new Set<() => void>();

/** Read straight from the draft: no cache to go stale, and a number snapshot is stable by
 *  value, which is all useSyncExternalStore needs. */
function getPickSnapshot(): number | null {
  try {
    const raw = window.localStorage.getItem(SURVEY_STATE_KEY);
    const value = raw ? JSON.parse(raw)?.answers?.[LANDING_PREFILL_QID] : null;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

function subscribeToPick(listener: () => void): () => void {
  pickListeners.add(listener);
  return () => pickListeners.delete(listener);
}

/** Where on the landing the answer was given, for the analytics. */
export type LandingPickLocation = "hero" | "footer";

export function useLandingPick(): {
  /** 1 to 7, or null before any answer. */
  selected: number | null;
  /** Saved on every tap (a change of mind included), so the pick is never lost even if the
   *  visitor never presses Continue. The value goes to PostHog only. */
  pick: (value: number, location: LandingPickLocation) => void;
} {
  const selected = useSyncExternalStore(subscribeToPick, getPickSnapshot, () => null);
  const pick = (value: number, location: LandingPickLocation) => {
    saveLandingPrefill(LANDING_PREFILL_QID, value);
    pickListeners.forEach((listener) => listener());
    trackLandingCardAnswer({ location, changed: selected !== null, value });
  };
  return { selected, pick };
}
