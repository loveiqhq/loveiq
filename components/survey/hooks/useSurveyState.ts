"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { surveyQuestions } from "@/data/survey-data";

const STORAGE_KEY = "loveiq-survey-answers";
const INDEX_KEY = "loveiq-survey-index";

export type AnswerValue = string | string[] | number;

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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        answers: parsed.answers || {},
        currentIndex: parsed.currentIndex || 0,
        startedAt: parsed.startedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Corrupted data — start fresh
  }
  return { answers: {}, currentIndex: 0, startedAt: new Date().toISOString() };
}

export function useSurveyState() {
  const [state, setState] = useState<SurveyState>(loadState);

  // Persist to localStorage on every change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full — silently ignore
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
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(INDEX_KEY);
    }
  }, []);

  const progress = useMemo(() => {
    const total = surveyQuestions.length;
    if (total === 0) return 0;
    const answered = Object.keys(state.answers).filter((k) => !k.endsWith("_other")).length;
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
