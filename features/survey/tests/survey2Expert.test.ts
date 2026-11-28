import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { RANDOMISE_QIDS } from "@features/survey/questionFlags";
import { surveyAnswersSchema } from "@features/survey/server/answersSchema";
import { SURVEY_TOTAL_QUESTIONS } from "@features/survey/server/utils";
import {
  EXPERT_PHONE_KEY,
  EXPERT_QID,
  expertPhoneValid,
  joinExpertPhone,
  guessExpertCode,
  splitExpertPhone,
} from "@features/survey/survey2/expert";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import { SURVEY_2_ONLY_QIDS } from "@shared/experiments/questionOrderArm";

/**
 * Survey 2.0's expert question (17004; Mark's board "Q-new-expert", placed on 24 Nov 2026 right
 * after the price question): a free talk with one of our experts, and on a Yes the phone number
 * they call (Marcus). Only 2.0 asks it.
 */
const ROOT = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const MIGRATION = "supabase/migrations/20261124190000_survey_2_expert_question.sql";
const ROLLBACK = "supabase/rollbacks/20261124190000_survey_2_expert_question_down.sql";

const YES = "Yes, I'd like a free talk with an expert";
const LATER = "Maybe later, after I've read my report";
const NO = "No, thanks";
const expert = () => surveyQuestions.find((q) => q.qId === "17004");

describe("the expert question", () => {
  it("offers a free talk with one of our experts: Yes, Maybe later or No", () => {
    expect(EXPERT_QID).toBe("17004");
    expect(expert()).toMatchObject({
      chapter: "Next steps",
      answerType: "single",
      question: "Would you like a free talk with one of our experts about improving your sex life?",
      guide:
        "It's free. Our trained coaches and therapists can help you understand your results and find next steps that fit you. We only get in touch if you say yes.",
      formatGuidance: "Select one option.",
      required: true,
    });
    expect(expert()!.options).toEqual([YES, LATER, NO]);
  });

  it("keeps its options in Mark's order", () => {
    expect(RANDOMISE_QIDS.has("17004")).toBe(false);
  });

  it("is asked by Survey 2.0 only, after the price question and before the details page", () => {
    const ids = orderAskedQuestions(surveyQuestions, "survey2").map((q) => q.qId);
    expect(ids).toHaveLength(62);
    expect(ids.slice(-3)).toEqual(["17003", "17004", "00010"]);
    expect(SURVEY_2_ONLY_QIDS).toContain("17004");
    for (const arm of ["control", "variant"] as const) {
      expect(orderAskedQuestions(surveyQuestions, arm).map((q) => q.qId)).not.toContain("17004");
    }
    expect(SURVEY_TOTAL_QUESTIONS).toBe(62);
  });
});

describe("the phone number on a Yes", () => {
  it("is stored as the country code and the number the reader typed", () => {
    expect(EXPERT_PHONE_KEY).toBe("17004_other");
    expect(joinExpertPhone("+49", "151 2345678")).toBe("+49 151 2345678");
    expect(splitExpertPhone("+43 660 1234567")).toEqual({ code: "+43", number: "660 1234567" });
    expect(splitExpertPhone(undefined)).toEqual({ code: "+49", number: "" });
  });

  // Mark, on his expert board (24 Nov): "can we have the country code pre-set based on their
  // browser country?" The question comes before the details page's country, so the browser's
  // time zone tells it first, then its languages; Germany when neither names a listed country.
  it("starts with the reader's own country code, from the browser", () => {
    expect(guessExpertCode("Europe/Vienna", ["de-DE"])).toBe("+43");
    expect(guessExpertCode("Europe/Zurich", ["fr-CH"])).toBe("+41");
    expect(guessExpertCode("Europe/London", ["en-GB"])).toBe("+44");
    expect(guessExpertCode("Australia/Sydney", ["en-AU"])).toBe("+61");
    expect(guessExpertCode("America/New_York", ["en-US"])).toBe("+1");
    // A time zone off the list: the languages' country, but en-US alone is no proof of America.
    expect(guessExpertCode("Europe/Sarajevo", ["de-AT", "en-US"])).toBe("+43");
    expect(guessExpertCode("Europe/Sarajevo", ["en-US"])).toBe("+49");
    expect(guessExpertCode(undefined, [])).toBe("+49");
    expect(splitExpertPhone("", "+43")).toEqual({ code: "+43", number: "" });
    expect(splitExpertPhone("+41 79 1234567", "+43")).toEqual({
      code: "+41",
      number: "79 1234567",
    });
  });

  it("needs at least six digits, as Mark's board asks before Next", () => {
    expect(expertPhoneValid("+49 12345")).toBe(false);
    expect(expertPhoneValid("+49 ")).toBe(false);
    expect(expertPhoneValid(undefined)).toBe(false);
    expect(expertPhoneValid("+49 123456")).toBe(true);
    expect(expertPhoneValid("+1 (555) 010-2030")).toBe(true);
  });

  it("is kept with a Yes and dropped with Maybe later or No", () => {
    const phone = { [EXPERT_PHONE_KEY]: "+49 151 2345678" };
    expect(surveyAnswersSchema.parse({ "17004": YES, ...phone })).toEqual({
      "17004": YES,
      ...phone,
    });
    expect(surveyAnswersSchema.parse({ "17004": LATER, ...phone })).toEqual({ "17004": LATER });
    expect(surveyAnswersSchema.parse({ "17004": NO, ...phone })).toEqual({ "17004": NO });
  });

  it("leaves every other question's text box to its Other option, as before", () => {
    expect(
      surveyAnswersSchema.parse({ "17003": "€1.99–€3.99", "17003_other": "typed anyway" })
    ).toEqual({ "17003": "€1.99–€3.99" });
  });
});

describe("its database rows", () => {
  const sql = read(MIGRATION);

  it("creates the question and its three options, word for word", () => {
    expect(sql).toContain("INSERT INTO survey_question");
    expect(sql).toContain("INSERT INTO survey_question_mapping");
    expect(sql).toContain("'17004'");
    expect(sql).toContain(expert()!.question.replace(/'/g, "''"));
    expect(sql).toContain(expert()!.guide!.replace(/'/g, "''"));
    for (const option of [YES, LATER, NO])
      expect(sql, option).toContain(option.replace(/'/g, "''"));
  });

  it("ships a rollback", () => {
    expect(read(ROLLBACK)).toContain("'17004'");
  });
});
