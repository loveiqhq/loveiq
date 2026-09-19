"use client";

import { GLOBAL_UTM_KEY } from "@shared/url/utm";
import { SURVEY_SESSION_KEY } from "./surveySession";
import type { SurveyAnswers } from "@features/survey/server/types";
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

/**
 * The one question the landing page asks up front (the hero / closing-CTA card
 * in features/landing/ui/white/WQuestionCard.tsx). Answering it there stores a
 * real answer and marks the qId as "prefilled", so SurveyEngine drops it from
 * the flow — 59 questions total, 58 of them inside /survey.
 */
export const LANDING_PREFILL_QID = "01002";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

/**
 * Persist an answer captured before the survey started, into the same blob
 * `useSurveyState` hydrates from.
 *
 * It only marks the question as prefilled for a FRESH draft. If the visitor
 * already has survey progress, the answer is still saved (so their choice is
 * never lost) but the question stays in the flow — removing a question from
 * under someone mid-survey would shift every index after it.
 */
export function saveLandingPrefill(qId: string, value: number): void {
  if (!canUseStorage()) return;
  try {
    const raw = localStorage.getItem(SURVEY_STATE_KEY);
    const prev = raw ? (JSON.parse(raw) as Record<string, unknown> | null) : null;
    const base = prev && typeof prev === "object" ? prev : {};
    const answers = (base.answers as Record<string, unknown> | undefined) ?? {};
    const prefilled = Array.isArray(base.prefilled) ? (base.prefilled as string[]) : [];
    const isFreshDraft = Object.keys(answers).length === 0 && !base.currentIndex;

    localStorage.setItem(
      SURVEY_STATE_KEY,
      JSON.stringify({
        ...base,
        answers: { ...answers, [qId]: value },
        startedAt: (base.startedAt as string | undefined) || new Date().toISOString(),
        prefilled: isFreshDraft && !prefilled.includes(qId) ? [...prefilled, qId] : prefilled,
      })
    );
  } catch {
    // Storage unavailable (private mode / quota). The survey still works — the
    // visitor just answers this question again inside the flow.
  }
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

export function clearPersistedSurveyState(options?: {
  clearPendingCompletion?: boolean;
  clearSurveySession?: boolean;
}): void {
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
    if (options?.clearSurveySession !== false) {
      sessionStorage.removeItem(SURVEY_SESSION_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}
