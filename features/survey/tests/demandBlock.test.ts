import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";
import { isRandomised } from "@features/survey/questionFlags";
import { SURVEY_TOTAL_QUESTIONS } from "@features/survey/server/utils";
import {
  DEMAND_BLOCK_QIDS,
  EMAIL_QID,
  OPT_IN_QID,
  orderDemandBlockBeforeEmail,
  orderEmailLast,
} from "@features/survey/ui/questionOrder";

/** Minimal stub — the ordering functions only read `qId`. */
function q(qId: string): SurveyQuestion {
  return { qId } as unknown as SurveyQuestion;
}

const find = (qId: string) => surveyQuestions.find((entry) => entry.qId === qId);
const ordered = () => orderDemandBlockBeforeEmail(orderEmailLast(surveyQuestions));

describe("demand block — C9, C10, C12", () => {
  it("defines all three questions", () => {
    for (const qId of DEMAND_BLOCK_QIDS) expect(find(qId), qId).toBeDefined();
  });

  it("C9 offers all 53 topics, capped at three picks", () => {
    const c9 = find("16016")!;
    expect(c9.answerType).toBe("multiple");
    expect(c9.options).toHaveLength(53);
    expect(c9.maxSelections).toBe(3);
    expect(new Set(c9.options).size).toBe(53); // a duplicate label would break option_text matching
  });

  it("C9 is randomised — 53 options is where position bias hurts most", () => {
    expect(isRandomised("16016")).toBe(true);
  });

  it("C10 and C12 are single-choice and stand alone without piping", () => {
    for (const qId of ["16017", "16018"]) {
      const entry = find(qId)!;
      expect(entry.answerType, qId).toBe("single");
      expect(entry.options.length, qId).toBeGreaterThan(1);
    }
  });

  it("no option label is empty or whitespace-only", () => {
    for (const qId of DEMAND_BLOCK_QIDS) {
      for (const option of find(qId)!.options) expect(option.trim(), qId).not.toBe("");
    }
  });
});

describe("orderDemandBlockBeforeEmail", () => {
  it("the generated data really does put the block AFTER the opt-in (what this fixes)", () => {
    const raw = surveyQuestions.map((entry) => entry.qId);
    expect(raw.indexOf("16016")).toBeGreaterThan(raw.indexOf(OPT_IN_QID));
  });

  it("leaves the opt-in as the very last question", () => {
    const out = ordered();
    expect(out[out.length - 1]!.qId).toBe(OPT_IN_QID);
  });

  it("puts the block immediately before the email question", () => {
    const ids = ordered().map((entry) => entry.qId);
    const emailIdx = ids.indexOf(EMAIL_QID);
    expect(ids.slice(emailIdx - DEMAND_BLOCK_QIDS.length, emailIdx)).toEqual([
      ...DEMAND_BLOCK_QIDS,
    ]);
  });

  it("asks C9 before C10 before C12 — C10 refers back to C9's picks", () => {
    const ids = ordered().map((entry) => entry.qId);
    expect(ids.indexOf("16016")).toBeLessThan(ids.indexOf("16017"));
    expect(ids.indexOf("16017")).toBeLessThan(ids.indexOf("16018"));
  });

  it("never drops or duplicates a question", () => {
    expect(
      ordered()
        .map((entry) => entry.qId)
        .sort()
    ).toEqual(surveyQuestions.map((entry) => entry.qId).sort());
  });

  it("preserves the relative order of every question outside the block", () => {
    const without = (qs: SurveyQuestion[]) =>
      qs.filter((entry) => !DEMAND_BLOCK_QIDS.includes(entry.qId)).map((entry) => entry.qId);
    expect(without(ordered())).toEqual(without(orderEmailLast(surveyQuestions)));
  });

  it("falls back to the opt-in as anchor when email has been prefilled away", () => {
    const input = [q("00001"), q("16016"), q("16017"), q("16018"), q(OPT_IN_QID)];
    expect(orderDemandBlockBeforeEmail(input).map((entry) => entry.qId)).toEqual([
      "00001",
      "16016",
      "16017",
      "16018",
      OPT_IN_QID,
    ]);
  });

  it("returns the input untouched when the block is absent", () => {
    const input = [q("00001"), q(EMAIL_QID), q(OPT_IN_QID)];
    expect(orderDemandBlockBeforeEmail(input)).toBe(input);
  });
});

describe("completion accounting", () => {
  it("counts the three new questions, or the survey can never complete", () => {
    // isCompletionReady tests answerCount >= SURVEY_TOTAL_QUESTIONS. Adding askable
    // questions without raising this total lets a survey register complete early;
    // adding them to a total that excludes them makes completion unreachable.
    const askable = surveyQuestions.filter((entry) => entry.qId !== "15011");
    expect(SURVEY_TOTAL_QUESTIONS).toBe(askable.length);
    for (const qId of DEMAND_BLOCK_QIDS) {
      expect(
        askable.some((entry) => entry.qId === qId),
        qId
      ).toBe(true);
    }
  });
});

describe("database rows exist for every option", () => {
  /**
   * Found by SUFFIX, not by full filename. A migration applied through the Supabase
   * MCP gets its ledger version stamped from the wall clock, so the file has to be
   * RENAMED afterwards to match — `check-migration-drift` fails otherwise, and its
   * own header documents that rename as the fix. Pinning the timestamp here made a
   * required, expected operation break this test with an ENOENT that says nothing
   * about what it guards.
   */
  const dir = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_survey_demand_block_c9_c10_c12.sql"));
  if (!file) {
    throw new Error(
      "no *_survey_demand_block_c9_c10_c12.sql in supabase/migrations — this test asserts " +
        "the migration's option_text matches the client, and cannot run without it"
    );
  }
  const sql = readFileSync(join(dir, file), "utf8");

  it("declares all three questions", () => {
    for (const qId of DEMAND_BLOCK_QIDS) {
      expect(sql, qId).toContain("frontend_qid = '" + qId + "'");
    }
  });

  it("has an answer_option row for every single option label", () => {
    // This is the contract that decides whether the block collects data at all.
    // submit_survey matches picks to answer_option by EXACT option_text and silently
    // stores a NULL link when it cannot find one, so a single stray character here loses
    // the answer with no error anywhere.
    for (const qId of DEMAND_BLOCK_QIDS) {
      const options = find(qId)!.options;
      const missing = options.filter((opt) => !sql.includes("'" + opt.replace(/'/g, "''") + "'"));
      expect(missing, qId + " has no answer_option row for: " + missing.join(", ")).toEqual([]);
    }
  });

  it("is idempotent — re-running must not duplicate rows", () => {
    for (const qId of DEMAND_BLOCK_QIDS) {
      expect(sql, qId).toContain("survey_question " + qId + " already exists, skipping");
    }
  });
});
