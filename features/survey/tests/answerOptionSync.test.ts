import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";

/**
 * Offline stand-in for `scripts/check-survey-db-sync.js`.
 *
 * That script is the real guard — it compares the labels the client can send against
 * `answer_option.option_text` in the live database — but it SKIPS (exit 0) when Supabase
 * credentials are absent, which is every local checkout and every CI job without secrets.
 * So the failure it protects against can be introduced and merged without anything going
 * red.
 *
 * The failure is quiet by design: `submit_survey` matches picks by exact option text, and
 * a label with no matching row does not error — it stores raw text with a NULL
 * answer_option_id and the pick stops joining to anything. That is what silently dropped
 * multi-select answers between 2026-05-19 and 2026-06-14.
 *
 * This test covers the narrower case that actually bites: reword a question's options in
 * the CSV and forget the paired migration.
 */
const MIGRATION = "supabase/migrations/20260911151600_answer_option_16011_paid_for.sql";

/** Options that already existed and were deliberately kept with identical wording. */
const PRE_EXISTING_16011 = ["Therapy, coaching, or counseling", "None of these"];

describe("16011 option labels are backed by answer_option rows", () => {
  const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");
  const options = surveyQuestions.find((q) => q.qId === "16011")!.options;

  it("the question still has exactly five options", () => {
    expect(options).toHaveLength(5);
  });

  it("every option is either pre-existing or inserted by the migration", () => {
    const unbacked = options.filter(
      (opt) => !PRE_EXISTING_16011.includes(opt) && !sql.includes(`'${opt}'`)
    );
    expect(
      unbacked,
      `these labels have no answer_option row, so picks would store with a NULL ` +
        `answer_option_id and silently stop joining:\n${unbacked.join("\n")}`
    ).toEqual([]);
  });

  it("the kept options are byte-identical to their original wording", () => {
    // Changing so much as the comma in "Therapy, coaching, or counseling" would orphan
    // every answer already linked to that row.
    for (const kept of PRE_EXISTING_16011) expect(options).toContain(kept);
  });

  it("the migration does not delete or overwrite retired options", () => {
    // Existing survey_submission_answer_options rows reference them by id; removing one
    // would break the foreign key and take real answers with it.
    // Comment lines are stripped first — the prose here explains why nothing is deleted,
    // and matching on that would make this assertion look like it passed for free.
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .toUpperCase();
    expect(statements).not.toMatch(/\bDELETE\b/);
    expect(statements).not.toMatch(/\bDROP\b/);
    expect(statements).not.toMatch(/\bUPDATE\b/);
  });
});
