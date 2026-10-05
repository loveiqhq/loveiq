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

  it("keeps the first picks when an answer is over the cap, instead of refusing it", () => {
    // A refusal at the final submit strands the reader: Retry resends the same stored
    // answers. Over-cap answers come from drafts saved before a cap went live (16001 and
    // 16014 on 2026-09-11) or a page left open across that deploy, and stranded one
    // reader. Trimming still keeps the ranking those answers feed within the cap.
    const over = surveyAnswersSchema.safeParse({ ...ok, "16001": ["a", "b", "c"] });
    expect(over.success).toBe(true);
    expect(over.data?.["16001"]).toEqual(["a", "b"]);
  });

  it("trims an over-cap answer on the cap-of-one question to its first pick", () => {
    expect(surveyAnswersSchema.safeParse({ ...ok, "16014": ["a", "b"] }).data?.["16014"]).toEqual([
      "a",
    ]);
  });

  it("leaves uncapped questions alone", () => {
    const many = ["a", "b", "c", "d", "e", "f"];
    expect(surveyAnswersSchema.safeParse({ ...ok, "16011": many }).success).toBe(true);
  });

  it("ignores non-array answers for a capped question", () => {
    // Defensive: a scale or open answer must not trip an array length check.
    expect(surveyAnswersSchema.safeParse({ ...ok, "16001": "single string" }).success).toBe(true);
  });

  it("trims a long uncapped list to 20 picks, and refuses only what no real client sends", () => {
    expect(
      surveyAnswersSchema.safeParse({ "16011": Array(21).fill("x") }).data?.["16011"]
    ).toHaveLength(20);
    expect(surveyAnswersSchema.safeParse({ "16011": Array(101).fill("x") }).success).toBe(false);
    const tooManyKeys = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, "x"]));
    expect(surveyAnswersSchema.safeParse(tooManyKeys).success).toBe(false);
  });
});

describe("surveyAnswersSchema — tidies what a real browser can have stored", () => {
  // A pending submit from before the Other box's 500-character limit can hold any length.
  // Refused at 20,000, Retry resent it and only Start Over (losing every answer) got out.
  it("cuts any length of text, never refusing it", () => {
    const parsed = surveyAnswersSchema.safeParse({
      "15010": "Other",
      "15010_other": "x".repeat(25_000),
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.["15010_other"]).toHaveLength(1000);
  });

  it("cuts text to 1000 characters (the Other box had no limit)", () => {
    const parsed = surveyAnswersSchema.safeParse({
      "15010": "Other",
      "15010_other": "x".repeat(5000),
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.["15010_other"]).toHaveLength(1000);
  });

  it("drops answers to a hidden question, and its Other text", () => {
    const parsed = surveyAnswersSchema.safeParse({ "15011": "a", "15011_other": "b", q1: "c" });
    expect(parsed.data).toEqual({ q1: "c" });
  });

  it("drops a scale answer that is not a number (it was a text question once)", () => {
    const scale = surveyQuestions.find((q) => q.answerType === "scale")!.qId;
    const parsed = surveyAnswersSchema.safeParse({ [scale]: "Somewhat", q1: "c" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ q1: "c" });
  });

  describe("the Other box's text", () => {
    /**
     * Typing under "Other" and then picking another answer kept the text in the answers,
     * so it was stored for a reader who had changed their mind.
     */
    it("is dropped once the answer is no longer Other", () => {
      const parsed = surveyAnswersSchema.safeParse({
        "15010": "Woman",
        "15010_other": "typed then changed",
      });
      expect(parsed.data).toEqual({ "15010": "Woman" });
    });

    it("is kept while Other is the answer, single or among several picks", () => {
      const parsed = surveyAnswersSchema.safeParse({
        "15010": "Other",
        "15010_other": "my words",
        "03003": ["Something else", "Other"],
        "03003_other": "also mine",
      });
      expect(parsed.data?.["15010_other"]).toBe("my words");
      expect(parsed.data?.["03003_other"]).toBe("also mine");
    });

    it("is dropped when its question has no answer at all", () => {
      expect(surveyAnswersSchema.safeParse({ "15010_other": "orphan" }).data).toEqual({});
    });

    it("is dropped when Other was cut from an over-cap pick list", () => {
      const parsed = surveyAnswersSchema.safeParse({
        "16001": ["a", "b", "Other"],
        "16001_other": "beyond the cap",
      });
      expect(parsed.data).toEqual({ "16001": ["a", "b"] });
    });
  });
});
