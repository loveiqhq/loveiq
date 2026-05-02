"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { surveyQuestions } from "@/data/survey-data";
import type { SurveyAnswerValue } from "@/lib/survey/types";
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
}

function loadState(): SurveyState {
  if (typeof window === "undefined") {
    return { answers: {}, currentIndex: 0, startedAt: new Date().toISOString() };
  }

  try {
    const pendingCompletion = loadPendingCompletion();
    if (pendingCompletion) {
      return {
        answers: pendingCompletion.answers || {},
        currentIndex: pendingCompletion.currentIndex || 0,
        startedAt: pendingCompletion.startedAt || new Date().toISOString(),
      };
    }

    const raw = localStorage.getItem(SURVEY_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        answers: parsed.answers || {},
        currentIndex: parsed.currentIndex || 0,
        startedAt: parsed.startedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Corrupted data - start fresh
  }

  return { answers: {}, currentIndex: 0, startedAt: new Date().toISOString() };
}

export function useSurveyState() {
  const [state, setState] = useState<SurveyState>(loadState);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(SURVEY_STATE_KEY, JSON.stringify(state));
    } catch {
      // Storage full - silently ignore
    }
  }, [state]);

  const setAnswer = useCallback((qId: string, value: AnswerValue) => {
    setState((s) => ({ ...s, answers: { ...s.answers, [qId]: value } }));
  }, []);

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
    setState({ answers: {}, currentIndex: 0, startedAt: new Date().toISOString() });
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
    progress,
    setAnswer,
    getAnswer,
    setCurrentIndex,
    clearState,
  };
}
