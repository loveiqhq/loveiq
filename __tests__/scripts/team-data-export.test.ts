/**
 * The team's copy of the production data (scripts/team-data-export.ts). Everything, unmasked,
 * by decision (2026-10-10), so these pin the little it still does: change nothing in the data,
 * leave out the tables that are not customer data and the people who restricted processing,
 * flag tests, write CSV Excel opens safely, and never write into a git repository.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertOutsideRepo,
  csvCell,
  driveQuoted,
  fileToReplace,
  isExported,
  prepare,
  readme,
  specsOf,
  toCsv,
  uniqueRows,
  type Dataset,
} from "../../scripts/team-data-export";

/** A report token in its real shape: `rpt_` and twenty alphanumerics. */
const TOKEN = "rpt_A1b2C3d4E5f6G7h8I9j0";

/** One person with a submission and what hangs off it, in several tables. */
function person(id: number, o: { email?: string } = {}): Dataset {
  const email = o.email ?? `person${id}@example.com`;
  return {
    app_user: [
      {
        id,
        email,
        first_name: `Name${id}`,
        user_profile_id: id * 7,
        processing_restricted_at: null,
      },
    ],
    user_profile: [{ id: id * 7, gender: "woman", sexual_orientation: "bisexual" }],
    survey_submission: [
      {
        id: id * 10,
        user_id: id,
        session_id: `session-${id}`,
        duration_ms: 600_000,
        regeneration_url: `https://www.loveiq.org/report/${TOKEN}`,
      },
    ],
    survey_submission_answer: [
      { id: id * 100, survey_submission_id: id * 10, answer_text: "self-described answer" },
    ],
    survey_partial_save: [
      {
        id: id * 2,
        session_id: `session-${id}`,
        answers: { "00000": email, "01002": "a" },
        started_at: "2026-10-01T10:00:00Z",
        saved_at: "2026-10-01T10:20:00Z",
      },
    ],
    personal_report: [{ id: id * 20, survey_submission_id: id * 10, url: `report/${TOKEN}` }],
    payment: [
      {
        id: id * 30,
        user_id: id,
        personal_report_id: id * 20,
        amount: 29,
        receipt_url: "https://pay.stripe.com/receipts/abc",
        card_last4: "4242",
        metadata: { plan: "full_report", reportToken: TOKEN },
      },
    ],
  };
}

function merge(...sets: Dataset[]): Dataset {
  const out: Dataset = {};
  for (const set of sets) {
    for (const [table, rows] of Object.entries(set)) (out[table] ??= []).push(...rows);
  }
  return out;
}

describe("the team data export", () => {
  it("changes nothing in the data: emails, names, answers, report links, payments", () => {
    const input = person(1);
    const out = prepare(structuredClone(input));
    for (const table of Object.keys(input)) {
      if (table === "survey_submission" || table === "survey_partial_save") continue;
      expect(out[table], table).toEqual(input[table]);
    }
    // The two flagged tables keep every column they had, plus the flags.
    expect(out.survey_submission![0]).toMatchObject(input.survey_submission![0]!);
    expect(out.survey_partial_save![0]).toMatchObject(input.survey_partial_save![0]!);
    expect(JSON.stringify(out)).toContain(TOKEN);
  });

  it("exports every customer table, and not Jarvis's index, the plumbing or the deletion log", () => {
    for (const table of ["app_user", "funnel_event", "report_session", "admin_users"]) {
      expect(isExported(table), table).toBe(true);
    }
    for (const table of [
      "brain_chunk",
      "brain_query",
      "slack_alert_sent",
      "cron_run",
      "rate_limits",
      "system_flags",
      "data_subject_request_log",
    ]) {
      expect(isExported(table), table).toBe(false);
    }
  });

  it("does not run at all while anyone has asked us to restrict processing", () => {
    const data = merge(person(1), person(2));
    data.app_user![1]!.processing_restricted_at = "2026-10-01T00:00:00Z";
    expect(() => prepare(data)).toThrow(/1 people asked us to restrict processing/);
    expect(() => prepare(merge(person(1), person(2)))).not.toThrow();
  });

  it("reads tables and keys from the database's description, and stops on a short one", () => {
    const pk = "Note:\nThis is a Primary Key.<pk/>";
    const fk = (table: string) =>
      `Note:\nThis is a Foreign Key to \`${table}.id\`.<fk table='${table}' column='id'/>`;
    const full = {
      app_user: {
        properties: {
          id: { description: pk },
          processing_restricted_at: {},
          user_profile_id: { description: fk("user_profile") },
        },
      },
      user_profile: { properties: { id: { description: pk } } },
      survey_submission: { properties: { id: { description: pk }, session_id: {} } },
      personal_report: { properties: { id: { description: pk } } },
      survey_submission_answer: { properties: { id: { description: pk } } },
      funnel_event: {
        properties: { visitor_id: { description: pk }, day: { description: pk }, step: {} },
      },
      brain_chunk: { properties: { id: { description: pk } } },
    };
    const specs = specsOf(full);
    expect(specs.map((s) => s.name)).not.toContain("brain_chunk");
    const user = specs.find((s) => s.name === "app_user")!;
    expect(user.key).toEqual(["id"]);
    expect(specs.find((s) => s.name === "funnel_event")!.key).toEqual(["visitor_id", "day"]);
    // A description without the restriction column, or with no tables, stops the run.
    const { processing_restricted_at: _gone, ...rest } = full.app_user.properties;
    expect(() => specsOf({ ...full, app_user: { properties: rest } })).toThrow(
      /app_user.processing_restricted_at/
    );
    expect(() => specsOf({})).toThrow(/missing/);
  });

  it("flags test rows the way the admin panel does, and keeps them", () => {
    const fast = person(3);
    fast.survey_submission![0]!.duration_ms = 30_000;
    const out = prepare(merge(person(1), person(2, { email: "eman@loveiq.org" }), fast));
    const flags = Object.fromEntries(
      out.survey_submission!.map((s) => [s.user_id, [s.is_likely_test, s.test_reasons]])
    );
    expect(flags).toEqual({
      1: [false, ""],
      2: [true, "staff_email"],
      3: [true, "short_duration"],
    });
    const partials = Object.fromEntries(
      out.survey_partial_save!.map((p) => [p.session_id, p.is_likely_test])
    );
    expect(partials).toEqual({ "session-1": false, "session-2": true, "session-3": false });
  });

  it("keeps a row once when a page boundary shifted under the read", () => {
    const rows = [
      { visitor_id: "a", day: "d1", n: 1 },
      { visitor_id: "a", day: "d2", n: 2 },
      { visitor_id: "a", day: "d2", n: 2 },
      { visitor_id: "b", day: "d1", n: 3 },
    ];
    expect(uniqueRows(rows, ["visitor_id", "day"])).toEqual([rows[0], rows[1], rows[3]]);
  });

  it("writes CSV that Excel opens without running anything", () => {
    expect(csvCell('=HYPERLINK("https://x")')).toBe(`"'=HYPERLINK(""https://x"")"`);
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("-2.5")).toBe("-2.5");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
    expect(csvCell(null)).toBe("");
    expect(toCsv([{ b: "x", a: 1 }], ["a", "b"])).toBe("a,b\n1,x\n");
    // An empty table still says what its columns are.
    expect(toCsv([], ["id", "email"])).toBe("id,email\n");
    // A column added on the way (the test flags) comes after the table's own.
    expect(toCsv([{ id: 1, is_likely_test: false }], ["id"])).toBe("id,is_likely_test\n1,false\n");
  });

  it("says in the README what is in it and what is not", () => {
    const text = readme(
      [{ name: "app_user", columns: ["id"], key: ["id"] }],
      { app_user: [{ id: 1 }, { id: 2 }] },
      "2026-10-10T20:00:00Z"
    );
    expect(text).toContain("| app_user.csv | 2 |");
    expect(text).toContain("The export stops while anyone has.");
    expect(text).toMatch(/Eman, Marcus, Mark, Fatih, Sanjin, Ajna/);
  });

  it("replaces exactly one Drive file per table, and stops on two", () => {
    expect(fileToReplace([], "app_user.csv")).toBeNull();
    expect(fileToReplace([{ id: "a" }], "app_user.csv")).toBe("a");
    expect(() => fileToReplace([{ id: "a" }, { id: "b" }], "app_user.csv")).toThrow(
      /2 files are named app_user.csv/
    );
    expect(driveQuoted("it's")).toBe("'it\\'s'");
    expect(driveQuoted("a\\b")).toBe("'a\\\\b'");
  });

  it("refuses to write inside any git repository", () => {
    const repo = resolve(__dirname, "../..");
    expect(() => assertOutsideRepo(repo)).toThrow(/inside a git repository/);
    expect(() => assertOutsideRepo(join(repo, "exports"))).toThrow(/inside a git repository/);
    // Another checkout entirely, as the main one is to a worktree.
    const other = mkdtempSync(join(tmpdir(), "export-guard-repo-"));
    spawnSync("git", ["init", "-q", other]);
    expect(() => assertOutsideRepo(join(other, "not-yet-created", "out"))).toThrow(
      /inside a git repository/
    );
    const plain = mkdtempSync(join(tmpdir(), "export-guard-plain-"));
    expect(() => assertOutsideRepo(join(plain, "out"))).not.toThrow();
  });
});
