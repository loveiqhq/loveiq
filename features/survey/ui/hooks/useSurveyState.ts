"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { surveyQuestions } from "@/data/survey-data";
import type { SurveyAnswerValue } from "@features/survey/server/types";
import {
  SURVEY_STATE_KEY,
  clearPersistedSurveyState,
  loadPendingCompletion,
} from "./surveyStorage";

export type AnswerValue = SurveyAnswerValue;

interface SurveyState {
  answers: Record<string, AnswerValue>;
  currentIndex: number;
  startedAt: string;
  /**
   * qIds already answered before the survey opened (the landing-page question).
   * SurveyEngine drops these from the flow so nobody is asked twice; the answers
   * themselves stay in `answers` and submit + score exactly like any other.
   */
  prefilled: string[];
}

/** Prefilled qIds live alongside the answers, so they survive a resume. */
function readPrefilled(): string[] {
  try {
    const raw = localStorage.getItem(SURVEY_STATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.prefilled) ? parsed.prefilled.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function loadState(): SurveyState {
  if (typeof window === "undefined") {
    return { answers: {}, currentIndex: 0, startedAt: new Date().toISOString(), prefilled: [] };
  }

  try {
    const pendingCompletion = loadPendingCompletion();
    if (pendingCompletion) {
      return {
        answers: pendingCompletion.answers || {},
        currentIndex: pendingCompletion.currentIndex || 0,
        startedAt: pendingCompletion.startedAt || new Date().toISOString(),
        // A pending completion predates this field, so read it from the draft —
        // otherwise the question list would grow back under a saved index.
        prefilled: readPrefilled(),
      };
    }

    const raw = localStorage.getItem(SURVEY_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        answers: parsed.answers || {},
        currentIndex: parsed.currentIndex || 0,
        startedAt: parsed.startedAt || new Date().toISOString(),
        prefilled: Array.isArray(parsed.prefilled) ? parsed.prefilled.filter(Boolean) : [],
      };
    }
  } catch {
    // Corrupted data - start fresh
  }

  return { answers: {}, currentIndex: 0, startedAt: new Date().toISOString(), prefilled: [] };
}

export function useSurveyState() {
  const [state, setState] = useState<SurveyState>(loadState);

  /**
   * The answers, readable SYNCHRONOUSLY — before React has committed the render that
   * `setAnswer` queued.
   *
   * This exists for one specific loss. `goNext` in SurveyEngine closes over `answers`,
   * and on the final question the answer is given and the survey submitted in two clicks
   * a fraction of a second apart. Click Next before React commits the state update from
   * the option click and the submit sends the map WITHOUT the last answer — no error, no
   * retry, the answer simply is not in the payload.
   *
   * Measured on production 2026-09-11: 202 of 1,764 completed submissions in 120 days
   * (11.5%) had NO row for 16015, the marketing opt-in, which is the last question. Of
   * the 20 whose draft outlived the submission, all 20 held the answer client-side and
   * 11 of them said "Yes" — consent given, never recorded, never added to the audience.
   *
   * Writing the ref inside `setAnswer` rather than in an effect is the whole point: an
   * effect runs after commit, which is exactly the window being missed.
   */
  const answersRef = useRef(state.answers);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(SURVEY_STATE_KEY, JSON.stringify(state));
    } catch {
      // Storage full - silently ignore
    }
  }, [state]);

  const setAnswer = useCallback((qId: string, value: AnswerValue) => {
    answersRef.current = { ...answersRef.current, [qId]: value };
    setState((s) => ({ ...s, answers: { ...s.answers, [qId]: value } }));
  }, []);

  /**
   * The answers as of the last `setAnswer`, not as of the last render. Anything that
   * SENDS the answers must read them through this — a closure over `answers` can be one
   * interaction stale, and on the final question that interaction is the whole answer.
   */
  const getLatestAnswers = useCallback(() => answersRef.current, []);

  const getAnswer = useCallback(
    (qId: string): AnswerValue | null => {
      return state.answers[qId] ?? null;
    },
    [state.answers]
  );

  const setCurrentIndex = useCallback((i: number) => {
    setState((s) => ({ ...s, currentIndex: i }));
  }, []);

  const clearState = useCallback(() => {
    // Starting over drops the landing prefill too, so all 59 questions return.
    answersRef.current = {};
    setState({
      answers: {},
      currentIndex: 0,
      startedAt: new Date().toISOString(),
      prefilled: [],
    });
    clearPersistedSurveyState({ clearPendingCompletion: true });
  }, []);

  const progress = useMemo(() => {
    const total = surveyQuestions.length;
    if (total === 0) return 0;
    const answered = Object.keys(state.answers).filter((key) => !key.endsWith("_other")).length;
    return Math.min(100, Math.round((answered / total) * 100));
  }, [state.answers]);

  return {
    answers: state.answers,
    currentIndex: state.currentIndex,
    startedAt: state.startedAt,
    prefilled: state.prefilled,
    progress,
    setAnswer,
    getAnswer,
    getLatestAnswers,
    setCurrentIndex,
    clearState,
  };
}
