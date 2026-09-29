import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { isHidden, isMultiline } from "@features/survey/questionFlags";
import {
  SURVEY_TOTAL_QUESTIONS,
  dropBlankOptionalAnswers,
  isCompletionReady,
} from "@features/survey/server/utils";
import { CONTENT_ASK_QIDS } from "@features/survey/ui/questionOrder";

/** Mark's copy (Slack, 29.09), shown in the GuidancePanel under both questions. */
const INFO =
  "We are always striving to include the very best content for our learn & practice sections in our report and are always open for your input.";

const INSIGHTS_Q =
  "What are the most interesting insights that you have come across around sexuality to date?";
const SOURCES_Q =
  "What are the best books, articles, blogs or YouTube channels around sexuality that you are aware of?";

const find = (qId: string) => surveyQuestions.find((entry) => entry.qId === qId);

describe("the content asks — 16019 and 16020", () => {
  it("asks both of Mark's questions, word for word", () => {
    expect(find("16019")?.question).toBe(INSIGHTS_Q);
    expect(find("16020")?.question).toBe(SOURCES_Q);
  });

  it("are open text questions that nobody has to answer", () => {
    for (const qId of CONTENT_ASK_QIDS) {
      const entry = find(qId)!;
      expect(entry.answerType, qId).toBe("open");
      expect(entry.inputType, qId).toBe("text");
      expect(entry.required, qId).toBe(false);
    }
  });

  it("tell the respondent they are optional, in the subtitle the flag is read from", () => {
    // `required: false` is derived from this sentence by scripts/update-survey.js, the way
    // the selection cap is derived from "Select up to three options.", so what the
    // respondent is told and how the question behaves cannot drift apart.
    for (const qId of CONTENT_ASK_QIDS) {
      expect(find(qId)!.formatGuidance, qId).toBe(
        "Optional. Share as much or as little as you like."
      );
    }
  });

  it("carry Mark's line as their info and guidance", () => {
    for (const qId of CONTENT_ASK_QIDS) expect(find(qId)!.supportAndGuidance, qId).toBe(INFO);
  });

  it("are the only optional questions — nothing else flipped with the new rule", () => {
    const optional = surveyQuestions.filter((entry) => !entry.required).map((e) => e.qId);
    expect(optional).toEqual(["16019", "16020"]);
  });

  it("render as multi-line boxes", () => {
    for (const qId of CONTENT_ASK_QIDS) expect(isMultiline(qId), qId).toBe(true);
    expect(isMultiline("00001")).toBe(false);
  });

  it("are asked, not hidden, and counted in the total", () => {
    for (const qId of CONTENT_ASK_QIDS) expect(isHidden(qId), qId).toBe(false);
    expect(SURVEY_TOTAL_QUESTIONS).toBe(62);
  });
});

describe("Mark's two stems from the 25.09 review", () => {
  it("16011 asks about personal development purchases", () => {
    expect(find("16011")?.question).toBe(
      "For your Personal Development, which of these have you paid for in the last 12 months?"
    );
  });

  it("C12 (16018) says we are building more assessments in the picked area", () => {
    // The tightened version of Mark's line (Fatih, 29.09): his verbatim wording ran to
    // seven lines on a phone.
    expect(find("16018")?.question).toBe(
      "We're building more assessments, including one on the area you picked. Would you like first access when we launch?"
    );
  });

  it("keep their options exactly as they were", () => {
    expect(find("16011")!.options).toHaveLength(5);
    expect(find("16018")!.options).toEqual(["Yes, tell me when it's ready", "No thanks"]);
  });
});

describe("completion with the optional asks skipped", () => {
  const withEmail = (answers: Record<string, string>) => ({
    ...answers,
    "00000": "person@example.com",
  });

  it("a respondent who skipped both still counts as finished", () => {
    // isCompletionReady feeds the admin recovery list. Counting the optional asks would
    // hide a finished draft from it whenever the index fallback does not apply, e.g. for a
    // visitor whose 01002 was answered on the landing page.
    const answers: Record<string, string> = {};
    for (const entry of surveyQuestions) {
      if (!isHidden(entry.qId) && entry.required) answers[entry.qId] = "answer";
    }
    expect(isCompletionReady(0, withEmail(answers))).toBe(true);
  });

  it("is not satisfied while a required answer is missing, however many optional ones exist", () => {
    const answers: Record<string, string> = { "16019": "an insight", "16020": "a book" };
    // Email is added back by withEmail, so the answer left out is the name (00001).
    const required = surveyQuestions.filter(
      (e) => !isHidden(e.qId) && e.required && e.qId !== "00000"
    );
    expect(required[0]!.qId).toBe("00001");
    for (const entry of required.slice(1)) answers[entry.qId] = "answer";
    expect(isCompletionReady(0, withEmail(answers))).toBe(false);
  });
});

describe("dropBlankOptionalAnswers", () => {
  it("drops an optional answer that is empty or only whitespace", () => {
    expect(dropBlankOptionalAnswers({ "16019": "", "16020": "   \n " })).toEqual({});
  });

  it("keeps an optional answer that says something", () => {
    expect(dropBlankOptionalAnswers({ "16019": "  Come as you are  ", "16020": "" })).toEqual({
      "16019": "  Come as you are  ",
    });
  });

  it("never touches a required question's answer, blank or not", () => {
    const answers = { "00001": "", "01002": 5, "16016": ["Money worries"] };
    expect(dropBlankOptionalAnswers(answers)).toEqual(answers);
  });
});

describe("the migration behind 16019, 16020 and the two stems", () => {
  /** Found by suffix: a migration applied through the MCP is renamed to its ledger version. */
  const dir = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_survey_content_asks_16019_16020.sql"));
  if (!file) {
    throw new Error(
      "no *_survey_content_asks_16019_16020.sql in supabase/migrations — submit_survey " +
        "silently drops answers to a question it has no row for, so the rows must ship with it"
    );
  }
  const sql = readFileSync(join(dir, file), "utf8");
  const quoted = (text: string) => "'" + text.replace(/'/g, "''") + "'";

  it("inserts both questions as open, optional and active, with the survey's exact text", () => {
    for (const qId of CONTENT_ASK_QIDS) {
      const entry = find(qId)!;
      expect(sql, qId).toContain("'open', " + quoted(entry.question) + ", " + quoted(INFO));
      expect(sql, qId).toContain("false, '" + qId + "', 'active')");
    }
    expect(sql.match(/INSERT INTO survey_question_mapping/g)).toHaveLength(2);
  });

  it("re-runs as a no-op, and refuses to reuse an id that already holds a different question", () => {
    for (const qId of CONTENT_ASK_QIDS) {
      expect(sql, qId).toContain("survey_question " + qId + " already exists, skipping");
      expect(sql, qId).toContain("survey_question " + qId + " already exists with different text");
    }
  });

  it("brings the database's copy of both stems in line with what the survey asks", () => {
    for (const qId of ["16011", "16018"]) {
      const text = quoted(find(qId)!.question);
      expect(sql, qId).toContain("SET question          = " + text);
      expect(sql, qId).toContain("AND question <> " + text);
    }
  });

  it("does not overwrite the 16011 provenance note on survey_submission_answer", () => {
    expect(sql).not.toMatch(/COMMENT ON TABLE/i);
  });
});
