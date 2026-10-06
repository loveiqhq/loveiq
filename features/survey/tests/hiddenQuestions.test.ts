import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { HIDDEN_QIDS, isHidden } from "@features/survey/questionFlags";
import { SURVEY_TOTAL_QUESTIONS, isCompletionReady } from "@features/survey/server/utils";

describe("hidden questions", () => {
  it("every hidden qId still exists in the survey data", () => {
    // Hiding keeps the definition — that is the whole difference from deleting. A qId
    // here that no longer exists would hide nothing and silently shrink the total.
    const known = new Set(surveyQuestions.map((q) => q.qId));
    for (const qId of HIDDEN_QIDS) expect(known).toContain(qId);
  });

  it("excludes hidden questions from the asked total", () => {
    expect(SURVEY_TOTAL_QUESTIONS).toBe(surveyQuestions.length - HIDDEN_QIDS.size);
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
    for (const q of surveyQuestions.filter((x) => !isHidden(x.qId))) {
      answers[q.qId] = "answer";
    }
    expect(isCompletionReady(SURVEY_TOTAL_QUESTIONS, answers)).toBe(true);
  });

  it("is not satisfied one required answer short", () => {
    // One REQUIRED answer: the content asks (16019, 16020) are optional and completion
    // does not wait on them (see contentAsks.test.ts), so leaving one of those out would
    // prove nothing.
    const asked = surveyQuestions.filter((q) => !isHidden(q.qId));
    const lastRequired = asked.filter((q) => q.required && q.qId !== "00000").at(-1)!;
    const answers: Record<string, string> = { "00000": "person@example.com" };
    for (const q of asked) if (q.qId !== lastRequired.qId) answers[q.qId] = "answer";
    expect(isCompletionReady(0, answers)).toBe(false);
  });
});
