// Shared survey fixture factory for tests. Builds typed mock survey questions
// + chapter intros so test files don't duplicate the same inline mock object
// shape. Use `makeSurveyQuestion(...)` to override a few fields without losing
// the required defaults; pull pre-built sets via `defaultSurveyQuestions()`.
//
// Why this exists: SurveyQuestion has 17+ fields. When one is added (e.g. the
// V8 `howAnswerIsUsed` addition), inline mocks across ~20 test files would
// each need a manual update. Routing everything through this factory turns a
// schema change into a one-file edit.

import type { AnswerOptionExplained, AnswerType, SurveyQuestion } from "@/data/survey-data";

type SurveyQuestionOverrides = Partial<SurveyQuestion>;

/**
 * Build a SurveyQuestion with sensible defaults. Override any field you care
 * about; the rest fill in to a valid "single" question on chapter 1.
 */
export function makeSurveyQuestion(overrides: SurveyQuestionOverrides = {}): SurveyQuestion {
  return {
    qId: "q1",
    cId: 1,
    chapter: "ch1",
    question: "Sample question?",
    answerType: "single",
    options: ["A", "B"],
    required: true,
    guide: "",
    supportAndGuidance: "",
    ...overrides,
  };
}

/**
 * Pre-built set of 4 questions across 2 chapters covering all answer types
 * exercised by component tests (single, scale, open, multiple). Mirrors the
 * old inline mock in SurveyEngine.test.tsx.
 */
export function defaultSurveyQuestions(): SurveyQuestion[] {
  return [
    makeSurveyQuestion({
      qId: "q1",
      cId: 1,
      chapter: "ch1",
      question: "Q1?",
      answerType: "single",
      options: ["A", "B"],
    }),
    makeSurveyQuestion({
      qId: "q2",
      cId: 1,
      chapter: "ch1",
      question: "Q2?",
      answerType: "scale",
      options: [],
      required: false,
      scaleLabels: { low: "Low", high: "High" },
    }),
    makeSurveyQuestion({
      qId: "q3",
      cId: 2,
      chapter: "ch2",
      question: "Q3?",
      answerType: "open",
      options: [],
      required: false,
    }),
    makeSurveyQuestion({
      qId: "q4",
      cId: 2,
      chapter: "ch2",
      question: "Q4?",
      answerType: "multiple",
      options: ["A", "B", "C", "D"],
      maxSelections: 3,
    }),
  ];
}

/** Convenience: a single-choice question with N answer options labelled A, B, C… */
export function makeSingleChoiceQuestion(
  optionCount: number,
  overrides: SurveyQuestionOverrides = {}
): SurveyQuestion {
  const options = Array.from({ length: optionCount }, (_, i) => String.fromCharCode(65 + i));
  return makeSurveyQuestion({ answerType: "single", options, ...overrides });
}

/** Convenience: a multi-select question with N options + a maxSelections cap. */
export function makeMultipleChoiceQuestion(
  optionCount: number,
  maxSelections: number,
  overrides: SurveyQuestionOverrides = {}
): SurveyQuestion {
  const options = Array.from({ length: optionCount }, (_, i) => String.fromCharCode(65 + i));
  return makeSurveyQuestion({ answerType: "multiple", options, maxSelections, ...overrides });
}

/** Convenience: a scale question with low/high labels. */
export function makeScaleQuestion(
  low: string,
  high: string,
  overrides: SurveyQuestionOverrides = {}
): SurveyQuestion {
  return makeSurveyQuestion({
    answerType: "scale",
    options: [],
    required: false,
    scaleLabels: { low, high },
    ...overrides,
  });
}

/** Convenience: a free-text open response question. */
export function makeOpenQuestion(overrides: SurveyQuestionOverrides = {}): SurveyQuestion {
  return makeSurveyQuestion({ answerType: "open", options: [], required: false, ...overrides });
}

/** Convenience: an answer-option-explained array, used by SingleChoiceQuestion explainers. */
export function makeAnswerOptionsExplained(
  pairs: ReadonlyArray<readonly [string, string]>
): AnswerOptionExplained[] {
  return pairs.map(([option, explanation]) => ({ option, explanation }));
}

export type { AnswerType, SurveyQuestion };
