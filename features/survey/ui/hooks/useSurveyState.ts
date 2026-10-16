"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SurveyAnswerValue } from "@features/survey/server/types";
import {
  resolveDraftQuestionOrderArm,
  resolveQuestionOrderOverride,
  type QuestionOrderArm,
} from "@shared/experiments/questionOrderArm";
import {
  SURVEY_STATE_KEY,
  clearPersistedSurveyState,
  loadPendingCompletion,
} from "./surveyStorage";
import { getSessionId } from "./surveySession";

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
  /**
   * C13's arm for this run, kept with the draft so a resume reopens the order it was
   * answered in. Decided once, when the draft loads — see resolveDraftQuestionOrderArm.
   */
  orderArm: QuestionOrderArm;
}

/** A draft as stored: its arm is whatever the device holds, if anything. */
type Draft = Omit<SurveyState, "orderArm"> & { orderArm?: unknown };

/** Prefilled qIds and the C13 arm live alongside the answers, so they survive a resume. */
function readDraftExtras(): Pick<Draft, "prefilled" | "orderArm"> {
  try {
    const raw = localStorage.getItem(SURVEY_STATE_KEY);
    if (!raw) return { prefilled: [] };
    const parsed = JSON.parse(raw);
    return {
      prefilled: Array.isArray(parsed?.prefilled) ? parsed.prefilled.filter(Boolean) : [],
      orderArm: parsed?.orderArm,
    };
  } catch {
    return { prefilled: [] };
  }
}

/**
 * C13's arm for a run: `?order=` where previews are allowed (never production), else
 * what the draft says. Without a window (server render) there is no session, so control.
 */
function orderArmFor(draft: Draft): QuestionOrderArm {
  if (typeof window === "undefined") return "control";
  const preview = resolveQuestionOrderOverride(
    new URLSearchParams(window.location.search).get("order")
  );
  return preview ?? resolveDraftQuestionOrderArm(getSessionId(), draft);
}

function loadState(): SurveyState {
  const draft = loadDraft();
  return { ...draft, orderArm: orderArmFor(draft) };
}

function loadDraft(): Draft {
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
        // A pending completion predates these fields, so read them from the draft —
        // otherwise the question list would grow back, or reorder, under a saved index.
        ...readDraftExtras(),
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
        orderArm: parsed.orderArm,
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
    // Starting over drops the landing prefill too, so every question returns.
    answersRef.current = {};
    // Cleared first: it drops the session id, and the new run's arm is its new id's.
    clearPersistedSurveyState({ clearPendingCompletion: true });
    const fresh: Draft = {
      answers: {},
      currentIndex: 0,
      startedAt: new Date().toISOString(),
      prefilled: [],
    };
    setState({ ...fresh, orderArm: orderArmFor(fresh) });
  }, []);

  return {
    answers: state.answers,
    currentIndex: state.currentIndex,
    startedAt: state.startedAt,
    prefilled: state.prefilled,
    orderArm: state.orderArm,
    setAnswer,
    getAnswer,
    getLatestAnswers,
    setCurrentIndex,
    clearState,
  };
}
