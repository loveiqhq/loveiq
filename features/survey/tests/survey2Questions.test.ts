import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { RANDOMISE_QIDS } from "@features/survey/questionFlags";
import { SURVEY_TOTAL_QUESTIONS } from "@features/survey/server/utils";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import { SURVEY_2_ONLY_QIDS } from "@shared/experiments/questionOrderArm";

/**
 * Survey 2.0's three closing questions (Mark's Survey Review, 19 Nov 2026, boards
 * "Q-new-enjoy", "Q-new-reflect", "Q-new-price-v2"). Only 2.0 asks them: the classic orders, and
 * every count a classic run is measured against, stay exactly as they were.
 */
const ROOT = join(__dirname, "..", "..", "..");
const MIGRATION = "supabase/migrations/20261123215058_survey_2_feedback_questions.sql";
const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
const byId = (qId: string) => surveyQuestions.find((q) => q.qId === qId);
/** The three this migration creates (the expert question, 17004, has its own: survey2Expert). */
const CLOSING = ["17001", "17002", "17003"] as const;

/** Today's classic orders, captured before Survey 2.0 touched the order code. */
const CONTROL_TODAY = ["00001","01002","01005","01006","02001","02002","02003","02004","03003","03004","03005","03006","03008","03009","03010","03011","03012","03013","08002","08003","08004","08005","08006","08012","09013","10002","10003","10004","10005","11001","11002","11003","11004","14020","14021","15001","15002","15003","15004","15005","15006","15007","15008","15009","15010","15011","16001","16002","16005","16006","16007","16009","16011","16012","16013","16014","16019","16020","16016","16017","16018","00000","16015"]; // prettier-ignore
const VARIANT_TODAY = ["00001","01002","03011","10005","11004","10004","02002","10003","02004","03003","03004","03005","03006","03008","03009","03010","03012","03013","08002","08003","08004","08005","08006","08012","09013","10002","01005","01006","02001","02003","11001","11002","11003","14020","14021","15001","15002","15003","15004","15005","15006","15007","15008","15009","15010","15011","16001","16002","16005","16006","16007","16009","16011","16012","16013","16014","16019","16020","16016","16017","16018","00000","16015"]; // prettier-ignore

const PRICE_BANDS = [
  "Fair would be to have it for free",
  "€1.99–€3.99",
  "€4.00–€9.99",
  "€10.00–€19.99",
  "€20.00–€29.99",
  "€30.00–€49.99",
  "€50.00 or more",
];

describe("the three closing questions", () => {
  it("asks how much the survey was enjoyed on a 1-7 scale", () => {
    expect(byId("17001")).toMatchObject({
      answerType: "scale",
      question: "How much did you enjoy taking this survey?",
      guide: "Go with your overall feeling, not just the last few questions.",
      formatGuidance: "Select one point on the scale.",
      scaleLabels: { low: "Not at all", high: "Extremely" },
      required: true,
    });
  });

  it("asks how much the questions helped reflection on a 1-7 scale", () => {
    expect(byId("17002")).toMatchObject({
      answerType: "scale",
      question: "How much did the questions help you reflect and learn about your sexuality?",
      guide: "Think of any question that made you pause or notice something new about yourself.",
      scaleLabels: { low: "Not at all", high: "Extremely" },
      required: true,
    });
  });

  it("asks a fair price for the full report in Mark's seven bands, in order", () => {
    const price = byId("17003");
    expect(price).toMatchObject({
      answerType: "single",
      question:
        "What feels like a fair price for your full report to become a more intelligent lover?",
      required: true,
    });
    expect(price!.options).toEqual(PRICE_BANDS);
  });

  it("are, with the expert question, the questions that mark a run as Survey 2.0's", () => {
    expect([...SURVEY_2_ONLY_QIDS]).toEqual([...CLOSING, "17004"]);
  });

  it("never shuffles the price ladder", () => {
    expect(RANDOMISE_QIDS.has("17003")).toBe(false);
  });

  it("never feeds the price answer into pricing", () => {
    const pricing = readFileSync(join(ROOT, "features/pricing/logic/reportPricing.ts"), "utf8");
    const line = pricing.split("\n").find((l) => l.includes("const PRICING_SIGNAL_QIDS"));
    expect(line).toBeDefined();
    expect(line).not.toContain("17003");
  });
});

describe("their database rows", () => {
  it("creates each question, scale or single, under its own id", () => {
    expect(sql).toContain("INSERT INTO survey_question");
    expect(sql).toContain("INSERT INTO survey_question_mapping");
    for (const qId of CLOSING) {
      expect(sql, qId).toContain(`'${qId}'`);
      expect(sql, qId).toContain(byId(qId)!.question.replace(/'/g, "''"));
    }
  });

  it("has an answer_option row for every price band", () => {
    const missing = PRICE_BANDS.filter((band) => !sql.includes(`'${band}'`));
    expect(missing).toEqual([]);
  });

  it("ships a rollback", () => {
    const down = readFileSync(
      join(ROOT, "supabase/rollbacks/20261123215058_survey_2_feedback_questions_down.sql"),
      "utf8"
    );
    for (const qId of CLOSING) expect(down).toContain(`'${qId}'`);
  });
});

describe("the classic survey is untouched", () => {
  it("control is exactly today's order", () => {
    expect(orderAskedQuestions(surveyQuestions, "control").map((q) => q.qId)).toEqual(
      CONTROL_TODAY
    );
  });

  it("variant is exactly today's order", () => {
    expect(orderAskedQuestions(surveyQuestions, "variant").map((q) => q.qId)).toEqual(
      VARIANT_TODAY
    );
  });

  it("still counts 62 questions", () => {
    expect(SURVEY_TOTAL_QUESTIONS).toBe(62);
  });
});
