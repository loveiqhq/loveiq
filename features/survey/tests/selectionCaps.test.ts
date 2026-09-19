import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { surveyAnswersSchema } from "@features/survey/server/answersSchema";
import { SURVEY_SELECTION_CAPS } from "@features/survey/server/utils";

describe("selection caps", () => {
  it("derives the cap from the guidance copy the respondent reads", () => {
    // The cap is not authored as a separate field — update-survey.js parses it out of
    // formatGuidance. If that parse ever silently stops working, the questions below
    // become uncapped and their answers stop being a ranking, with nothing else failing.
    expect(SURVEY_SELECTION_CAPS.get("16001")).toBe(2);
    expect(SURVEY_SELECTION_CAPS.get("16014")).toBe(1);
  });

  it("keeps the three questions that were already capped at three", () => {
    // Widening the guidance regex to accept "Select one option." must not disturb the
    // existing "Select up to three options." questions.
    for (const qId of ["03003", "10002", "14020"]) {
      expect(SURVEY_SELECTION_CAPS.get(qId)).toBe(3);
    }
  });

  it("leaves genuinely uncapped questions uncapped", () => {
    expect(SURVEY_SELECTION_CAPS.has("16011")).toBe(false);
  });

  it("every capped question is a multi-select, and the cap fits its option list", () => {
    for (const [qId, cap] of SURVEY_SELECTION_CAPS) {
      const q = surveyQuestions.find((x) => x.qId === qId);
      expect(q, `capped question ${qId} must exist`).toBeDefined();
      expect(q!.answerType, `${qId} must be multi-select to cap`).toBe("multiple");
      expect(cap).toBeGreaterThan(0);
      // A cap at or above the option count is a no-op and almost always a mistake.
      expect(cap, `${qId} cap must be below its ${q!.options.length} options`).toBeLessThan(
        q!.options.length
      );
    }
  });

  it("the guidance sentence states the cap it enforces", () => {
    // Copy and behaviour are the same source here, so they cannot drift — but a reworded
    // sentence that no longer parses would silently uncap the question.
    const words: Record<number, string> = { 1: "one", 2: "two", 3: "three" };
    for (const [qId, cap] of SURVEY_SELECTION_CAPS) {
      const guidance = surveyQuestions.find((q) => q.qId === qId)!.formatGuidance ?? "";
      expect(guidance.toLowerCase()).toContain(words[cap]!);
    }
  });
});

describe("surveyAnswersSchema — server-side cap enforcement", () => {
  const ok = { "00000": "person@example.com" };

  it("accepts a selection count at the cap", () => {
    expect(surveyAnswersSchema.safeParse({ ...ok, "16001": ["a", "b"] }).success).toBe(true);
    expect(surveyAnswersSchema.safeParse({ ...ok, "16014": ["a"] }).success).toBe(true);
  });

  it("rejects one selection over the cap", () => {
    // The whole point of enforcing server-side: the UI already blocks this, so anything
    // arriving here came from a client that does not play by the rules.
    const over = surveyAnswersSchema.safeParse({ ...ok, "16001": ["a", "b", "c"] });
    expect(over.success).toBe(false);
    expect(JSON.stringify(over.error?.issues)).toContain("At most 2 selections allowed");
  });

  it("rejects an over-cap answer on the cap-of-one question", () => {
    expect(surveyAnswersSchema.safeParse({ ...ok, "16014": ["a", "b"] }).success).toBe(false);
  });

  it("leaves uncapped questions alone", () => {
    const many = ["a", "b", "c", "d", "e", "f"];
    expect(surveyAnswersSchema.safeParse({ ...ok, "16011": many }).success).toBe(true);
  });

  it("ignores non-array answers for a capped question", () => {
    // Defensive: a scale or open answer must not trip an array length check.
    expect(surveyAnswersSchema.safeParse({ ...ok, "16001": "single string" }).success).toBe(true);
  });

  it("still enforces the pre-existing bounds", () => {
    expect(surveyAnswersSchema.safeParse({ "16011": Array(21).fill("x") }).success).toBe(false);
  });
});
