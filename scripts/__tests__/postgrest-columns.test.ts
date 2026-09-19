import { describe, expect, it } from "vitest";

import { findBadColumns, stripEmbeds } from "../check-postgrest-columns.mjs";

const live = new Map<string, Set<string>>([
  ["email_suppression", new Set(["email", "reason", "created_at"])],
  ["survey_question", new Set(["id", "frontend_qid", "question"])],
  ["payment", new Set(["id", "personal_report_id", "created_date_time", "is_test", "status"])],
  ["personal_report", new Set(["id", "survey_submission_id"])],
]);

const scan = (src: string) =>
  findBadColumns(["f.ts"], live, () => src).findings.map((f) => `${f.table}.${f.column}`);

describe("stripEmbeds", () => {
  /**
   * The naive regex version invented columns called `)` and `app_user!` — 30 of
   * them — which is exactly the noise that gets a check switched off.
   */
  it("drops embedded resources, FK hints and nested parens", () => {
    expect(stripEmbeds("id,name")).toBe("id,name");
    expect(stripEmbeds("id,app_user!fk_a(email,name)")).toBe("id,");
    expect(stripEmbeds("a,rel(b,inner(c,d)),e")).toBe("a,,e");
    expect(stripEmbeds("created_date_time,personal_report!fk_p(survey_submission_id)")).toBe(
      "created_date_time,"
    );
  });
});

describe("findBadColumns", () => {
  /** The three that were live in production on 2026-09-19. */
  it("catches a column that does not exist", () => {
    expect(scan("`/rest/v1/email_suppression?select=id&reason=eq.x`")).toEqual([
      "email_suppression.id",
    ]);
    expect(scan("`/rest/v1/survey_question?select=id,frontend_qid,question_text`")).toEqual([
      "survey_question.question_text",
    ]);
    expect(scan("`/rest/v1/payment?select=survey_submission_id,created_date_time`")).toEqual([
      "payment.survey_submission_id",
    ]);
  });

  it("accepts the fixed forms, including the disambiguated embed", () => {
    expect(scan("`/rest/v1/email_suppression?select=email&reason=eq.x`")).toEqual([]);
    expect(scan("`/rest/v1/survey_question?select=id,frontend_qid,question`")).toEqual([]);
    expect(
      scan(
        "`/rest/v1/payment?select=created_date_time,personal_report!fk_payment_personal_report(survey_submission_id)`"
      )
    ).toEqual([]);
  });

  it("accepts an output alias (out:column) and skips dynamic or * selects", () => {
    expect(scan("`/rest/v1/survey_question?select=text:question`")).toEqual([]);
    expect(scan("`/rest/v1/survey_question?select=*`")).toEqual([]);
    expect(scan("`/rest/v1/survey_question?select=${cols}`")).toEqual([]);
  });

  it("ignores a table it has no live schema for, rather than guessing", () => {
    expect(scan("`/rest/v1/some_unknown_table?select=whatever`")).toEqual([]);
  });
});
