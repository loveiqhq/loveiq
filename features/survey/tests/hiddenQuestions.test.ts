import { describe, expect, it } from "vitest";
import { SURVEY_2_ONLY_QIDS } from "@shared/experiments/questionOrderArm";

import { surveyQuestions } from "@/data/survey-data";
import { HIDDEN_QIDS, isHidden } from "@features/survey/questionFlags";
import { SURVEY_TOTAL_QUESTIONS, isCompletionReady } from "@features/survey/server/utils";

/** What a classic run is asked: not the hidden ones, nor Survey 2.0's own closing questions. */
const classicAsked = () => {
  const survey2Only: readonly string[] = SURVEY_2_ONLY_QIDS;
  return surveyQuestions.filter((q) => !isHidden(q.qId) && !survey2Only.includes(q.qId));
};

describe("hidden questions", () => {
  it("every hidden qId still exists in the survey data", () => {
    // Hiding keeps the definition — that is the whole difference from deleting. A qId
    // here that no longer exists would hide nothing and silently shrink the total.
    const known = new Set(surveyQuestions.map((q) => q.qId));
    for (const qId of HIDDEN_QIDS) expect(known).toContain(qId);
  });

  it("excludes hidden questions from the asked total", () => {
    // The classic total: Survey 2.0's own closing questions are never asked in it either.
    expect(SURVEY_TOTAL_QUESTIONS).toBe(
      surveyQuestions.length - HIDDEN_QIDS.size - SURVEY_2_ONLY_QIDS.length
    );
  });

  it("15011 (Article 9 orientation data) is no longer asked", () => {
    expect(isHidden("15011")).toBe(true);
    expect(surveyQuestions.some((q) => q.qId === "15011")).toBe(true);
  });

  it("a respondent can still complete the survey", () => {
    // The trap this guards: isCompletionReady tests answerCount >= SURVEY_TOTAL_QUESTIONS.
    // If a hidden question stayed in that total, the count could never be reached and no
    // survey would ever register as complete.
    const answers: Record<string, string> = { "00000": "person@example.com" };
    for (const q of classicAsked()) {
      answers[q.qId] = "answer";
    }
    expect(isCompletionReady(SURVEY_TOTAL_QUESTIONS, answers)).toBe(true);
  });

  it("is not satisfied one required answer short", () => {
    // One REQUIRED answer: the content asks (16019, 16020) are optional and completion
    // does not wait on them (see contentAsks.test.ts), so leaving one of those out would
    // prove nothing.
    const asked = classicAsked();
    const lastRequired = asked.filter((q) => q.required && q.qId !== "00000").at(-1)!;
    const answers: Record<string, string> = { "00000": "person@example.com" };
    for (const q of asked) if (q.qId !== lastRequired.qId) answers[q.qId] = "answer";
    expect(isCompletionReady(0, answers)).toBe(false);
  });
});
