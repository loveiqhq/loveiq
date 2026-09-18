import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { RANDOMISE_QIDS } from "@features/survey/questionFlags";
import { OPT_IN_QID, orderEmailLast } from "@features/survey/ui/questionOrder";

const MIGRATION = "supabase/migrations/20260911152724_survey_question_16009_priced_choice.sql";
const NONE_OF_THESE = "None of these right now";

describe("16009 — the priced choice", () => {
  const question = surveyQuestions.find((q) => q.qId === "16009");
  const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");

  it("exists as a required single-choice question", () => {
    expect(question).toBeDefined();
    expect(question!.answerType).toBe("single");
    expect(question!.required).toBe(true);
  });

  it("offers four priced formats plus an honest opt-out, in that order", () => {
    expect(question!.options).toHaveLength(5);
    // "None of these" must stay last. Somebody who would not buy any of them is the most
    // informative answer in the set, and burying it mid-list suppresses it.
    expect(question!.options.at(-1)).toBe(NONE_OF_THESE);
    const priced = question!.options.slice(0, 4);
    expect(priced.every((o) => /€\d/.test(o))).toBe(true);
  });

  it("is NOT randomised — the options are a price ladder", () => {
    // Shuffling a price ladder destroys the comparison, and an opt-out that moves around
    // stops meaning "none of these".
    expect(RANDOMISE_QIDS.has("16009")).toBe(false);
  });

  it("does not displace the marketing opt-in from last position", () => {
    // Questions render in qId order, so an id above 16015 would push the opt-in off the
    // end of the survey. This is why the question is 16009 and not 16016.
    const ordered = orderEmailLast(surveyQuestions.filter((q) => q.qId !== "00000"));
    expect(ordered.at(-1)!.qId).toBe(OPT_IN_QID);
    expect(question!.qId < OPT_IN_QID).toBe(true);
  });

  it("every option label has a matching answer_option row in the migration", () => {
    // A new question stores nothing without these rows — submit_survey resolves picks by
    // exact option text and simply drops a label it cannot find.
    const missing = question!.options.filter((opt) => !sql.includes(`'${opt}'`));
    expect(missing, `no answer_option row for:\n${missing.join("\n")}`).toEqual([]);
  });

  it("the migration creates the question row itself, not just its options", () => {
    expect(sql).toContain("INSERT INTO survey_question");
    expect(sql).toContain("'16009'");
    expect(sql).toContain("INSERT INTO survey_question_mapping");
  });

  it("the question text matches between survey data and migration", () => {
    expect(sql).toContain(question!.question);
  });

  it("states in the survey copy that nothing is for sale", () => {
    // These euro amounts are hypothetical. The respondent has to be told that, or the
    // question reads as a checkout and the answer stops being honest.
    expect(question!.guide.toLowerCase()).toContain("nothing is for sale");
  });
});
