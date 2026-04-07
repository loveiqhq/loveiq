"use client";

import { GLOBAL_UTM_KEY } from "@/lib/utm";
import { SURVEY_SESSION_KEY } from "./surveySession";
import type { SurveyAnswers } from "@/lib/survey/types";
import { UTM_STORAGE_KEY } from "./useUtmCapture";

export const SURVEY_STATE_KEY = "loveiq-survey-answers";
export const SURVEY_INDEX_KEY = "loveiq-survey-index";
export const SURVEY_STEP_KEY = "loveiq-survey-step";
export const PENDING_COMPLETION_KEY = "loveiq-survey-pending-completion";
export const ANSWERS_STORAGE_KEY = SURVEY_STATE_KEY;

export interface PendingSurveyCompletion {
  sessionId: string;
  email: string;
  firstName: string;
  answers: SurveyAnswers;
  startedAt: string;
  durationMs: number;
  utmTracker: string | null;
  currentIndex: number;
  savedAt: string;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function loadPendingCompletion(): PendingSurveyCompletion | null {
  if (!canUseStorage()) return null;

  try {
    const raw = localStorage.getItem(PENDING_COMPLETION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSurveyCompletion | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.sessionId || !parsed.email || !parsed.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePendingCompletion(payload: PendingSurveyCompletion): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(PENDING_COMPLETION_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable */
  }
}

export function clearPendingCompletion(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(PENDING_COMPLETION_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function clearPersistedSurveyState(options?: { clearPendingCompletion?: boolean }): void {
  if (!canUseStorage()) return;

  try {
    localStorage.removeItem(SURVEY_STATE_KEY);
    localStorage.removeItem(SURVEY_INDEX_KEY);
    localStorage.removeItem(UTM_STORAGE_KEY);
    localStorage.removeItem(GLOBAL_UTM_KEY);
    if (options?.clearPendingCompletion) {
      localStorage.removeItem(PENDING_COMPLETION_KEY);
    }
    sessionStorage.removeItem(SURVEY_STEP_KEY);
    sessionStorage.removeItem(SURVEY_SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}
