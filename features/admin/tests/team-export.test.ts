/**
 * The team's copy of the production data (features/admin/server/team-export.ts, run by
 * scripts/team-data-export.ts and app/api/cron/team-export). Everything, unmasked, by
 * decision (2026-10-10), so these pin the little it still does: change nothing in the data,
 * leave out the tables that are not customer data and stop for people who restricted
 * processing, flag tests, write CSV Excel opens safely, upload only into a folder the team
 * alone can open, keep editors from sharing the files on, and never write into a git
 * repository.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The database's API as the real reader sees it: pages of rows, answered here. */
const pages = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@features/admin/server/supabase", () => ({
  POSTGREST_MAX_ROWS: 2,
  supabaseFetch: (path: string) => pages.fetch(path),
}));

import {
  assertTeamOnly,
  buildExport,
  csvCell,
  driveQuoted,
  findTeamFolder,
  isExported,
  unclassifiedColumns,
  MASKED,
  masker,
  maskRow,
  OutOfTime,
  plan,
  readme,
  specsOf,
  toCsv,
  uniqueRows,
  uploadExport,
  withTestFlag,
  type TableSpec,
} from "@features/admin/server/team-export";
import { assertOutsideRepo } from "../../../scripts/team-data-export";

type Row = Record<string, unknown>;
type Dataset = Record<string, Row[]>;

/** A report token in its real shape: `rpt_` and twenty alphanumerics. */
const TOKEN = "rpt_A1b2C3d4E5f6G7h8I9j0";

/** The survey's questions: its email, name and postcode ones, a scale and an open one. */
const QUESTIONS: Dataset = {
  survey_question: [
    { id: 1, frontend_qid: "00000", question: "What is your email?" },
    { id: 2, frontend_qid: "00001", question: "What is your name?" },
    { id: 5, frontend_qid: "01002", question: "How often do you think about sex?" },
    { id: 40, frontend_qid: "15002", question: "Which ZIP / postal code do you live in?" },
    { id: 67, frontend_qid: "16019", question: "Was there a learning that changed you?" },
  ],
};

/** One person with a submission and what hangs off it, in several tables. */
function person(id: number, o: { email?: string; durationMs?: number } = {}): Dataset {
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
    user_profile: [
      {
        id: id * 7,
        last_name: `Surname${id}`,
        birthday: "1990-05-0" + id,
        gender: "woman",
        sexual_orientation: "bisexual",
      },
    ],
    report_access_email: [{ id: id * 3, personal_report_id: id * 20, email }],
    survey_submission: [
      {
        id: id * 10,
        user_id: id,
        session_id: `session-${id}`,
        duration_ms: o.durationMs ?? 600_000,
        regeneration_url: `https://www.loveiq.org/report/${TOKEN}`,
      },
    ],
    survey_submission_answer: [
      {
        id: id * 100,
        survey_submission_id: id * 10,
        survey_question_id: 1,
        answer_text: email,
        normalized_value: email,
      },
      {
        id: id * 100 + 1,
        survey_submission_id: id * 10,
        survey_question_id: 2,
        answer_text: `Name${id}`,
        normalized_value: null,
      },
      {
        id: id * 100 + 2,
        survey_submission_id: id * 10,
        survey_question_id: 40,
        answer_text: "10115",
        normalized_value: null,
      },
      {
        id: id * 100 + 3,
        survey_submission_id: id * 10,
        survey_question_id: 5,
        answer_text: null,
        normalized_value: 4,
      },
      {
        id: id * 100 + 4,
        survey_submission_id: id * 10,
        survey_question_id: 67,
        answer_text: `Reading Esther Perel. Write to me at ${email}`,
        normalized_value: null,
      },
    ],
    survey_partial_save: [
      {
        id: id * 2,
        session_id: `session-${id}`,
        answers: { "00000": email, "00001": `Name${id}`, "15002": "10115", "01002": "a" },
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
        ip_address: "203.0.113.7",
        metadata: { plan: "full_report", reportToken: TOKEN, requestIp: "203.0.113.7" },
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

/** The tables of a dataset as the database would describe them, in name order. */
function specsFor(data: Dataset): TableSpec[] {
  return Object.keys(data)
    .sort()
    .map((name) => ({ name, columns: Object.keys(data[name]![0] ?? {}), key: ["id"] }));
}

/** Reads from the dataset, as the database would, and records which tables were read. */
function reader(data: Dataset) {
  return vi.fn(async (spec: TableSpec) => structuredClone(data[spec.name] ?? []));
}

const csvOf = (files: Array<{ name: string; body: string }>, table: string) =>
  files.find((f) => f.name === `${table}.csv`)?.body ?? "";

describe("the team data export", () => {
  it("masks what identifies a person, and keeps what they answered and did", async () => {
    const data = merge(QUESTIONS, person(1), person(2));
    const files = await buildExport(specsFor(data), reader(data));
    const all = files.map((f) => f.body).join("\n");
    // No address and no report token anywhere, in any file.
    expect(all).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(all).not.toContain("rpt_");
    expect(all).not.toContain("203.0.113.7");
    for (const id of [1, 2]) {
      expect(all).not.toContain(`Name${id}`);
      expect(all).not.toContain(`Surname${id}`);
      expect(all).not.toContain(`1990-05-0${id}`);
    }
    expect(all).not.toContain("10115");
    expect(all).not.toContain("4242");
    expect(all).not.toContain("pay.stripe.com");
    // One person's address is one code everywhere in the copy, so tables still join on it.
    const code = (table: string) => csvOf(files, table).match(/masked-[0-9a-f]{12}/g) ?? [];
    expect(code("app_user")).toHaveLength(2);
    expect(code("report_access_email")).toEqual(code("app_user"));
    expect(code("survey_submission_answer")).toEqual(
      expect.arrayContaining([code("app_user")[0], code("app_user")[1]])
    );
    // What they answered and did stays: the scale answer, the open answer's words, the
    // demographics, the payment.
    const answers = csvOf(files, "survey_submission_answer");
    expect(answers).toContain(",5,,4\n");
    expect(answers).toContain("Reading Esther Perel. Write to me at masked-");
    expect(answers.match(/\[masked\]/g)).toHaveLength(2 * 3 + 2);
    expect(csvOf(files, "user_profile")).toContain(",woman,bisexual");
    expect(csvOf(files, "payment")).toContain(",29,");
    expect(csvOf(files, "payment")).toContain('""plan"":""full_report""');
    expect(csvOf(files, "survey_partial_save")).toContain('""01002"":""a""');
  });

  it("gives every copy new codes and keeps them steady inside one", () => {
    const a = masker();
    expect(a.email("Person@Example.com ")).toMatch(/^masked-[0-9a-f]{12}$/);
    expect(a.email("person@example.com")).toBe(a.email(" PERSON@example.com"));
    expect(masker().email("person@example.com")).not.toBe(a.email("person@example.com"));
  });

  it("masks by column and by key, and leaves what only looks similar", () => {
    const m = masker(Buffer.alloc(32));
    const ids = new Set([1]);
    // `email_position` is the A/B arm, not an address; a column of addresses is masked whole.
    expect(maskRow("funnel_event", { email_position: "top" }, m, ids)).toEqual({
      email_position: "top",
    });
    expect(maskRow("waitlist_user", { email: "typo@nodomain" }, m, ids).email).toMatch(/^masked-/);
    expect(
      maskRow(
        "admin_dashboard_subscription",
        { subscriber_emails: ["a@loveiq.org", "ops-team"] },
        m,
        ids
      ).subscriber_emails
    ).toEqual([m.email("a@loveiq.org"), m.email("ops-team")]);
    // Links and tokens by their column or key, whatever shape the token takes.
    expect(maskRow("personal_report", { url: "report/legacy123" }, m, ids).url).toBe(MASKED);
    expect(maskRow("report_access_token", { token: "tok_legacy" }, m, ids).token).toBe(MASKED);
    expect(
      maskRow("payment", { metadata: { reportToken: "legacy123", plan: "full" } }, m, ids).metadata
    ).toEqual({ reportToken: MASKED, plan: "full" });
    // Credentials, addresses and answers inside JSON, and the raw payloads whole.
    expect(
      maskRow(
        "report_price_quote",
        {
          metadata: {
            reportToken: TOKEN,
            nurturePromoCodes: { "30h_no_unlock": "SAVE50-X" },
            urgency: "high",
          },
        },
        m,
        ids
      ).metadata
    ).toEqual({ reportToken: MASKED, nurturePromoCodes: MASKED, urgency: "high" });
    expect(maskRow("admin_audit_log", { metadata: { answer: "Anna" } }, m, ids).metadata).toEqual({
      answer: MASKED,
    });
    expect(maskRow("booking_event", { raw: { name: "Anna" } }, m, ids).raw).toBe(MASKED);
    expect(maskRow("payment_webhook_event", { event_data: { id: "evt" } }, m, ids).event_data).toBe(
      MASKED
    );
    // An address with its @ as %40, inside a link, is the same person's code.
    expect(
      maskRow("analytics_event", { metadata: { pathname: "/x?e=a%40b.com" } }, m, ids).metadata
    ).toEqual({ pathname: `/x?e=${m.email("a@b.com")}` });
    // The stand-in an earlier fix left in old rows goes too, so no `rpt_` survives anywhere.
    expect(
      maskRow("analytics_event", { metadata: { p: "token=rpt_<redacted>&x=1" } }, m, ids).metadata
    ).toEqual({
      p: `token=${MASKED}&x=1`,
    });
    // A link with the token as a query parameter, the other shape it travels in.
    expect(
      maskRow("analytics_event", { metadata: { pathname: `/checkout?token=${TOKEN}` } }, m, ids)
        .metadata
    ).toEqual({ pathname: `/checkout?token=${MASKED}` });
    // Outside tools' session ids, whose recordings show the person, and an admin's search.
    expect(
      maskRow(
        "survey_submission",
        { session_id: "s1", posthog_session_id: "ph", hotjar_user_id: "hj" },
        m,
        ids
      )
    ).toEqual({ session_id: "s1", posthog_session_id: MASKED, hotjar_user_id: MASKED });
    expect(
      maskRow("admin_audit_log", { metadata: { query: "Anna K", tool: "search" } }, m, ids).metadata
    ).toEqual({ query: MASKED, tool: "search" });
    // Keys are matched however they are written, as deep as they go: camelCase, ALL CAPS.
    expect(
      maskRow(
        "scoring_result",
        {
          diagnostics: {
            overlaysText: { OVL_POSTAL_CODE: "10115", OVL_COUNTRY: "Germany" },
            customer: { firstName: "Anna", fullName: "Anna K", customerEmail: "a@b.com" },
          },
        },
        m,
        ids
      ).diagnostics
    ).toEqual({
      overlaysText: { OVL_POSTAL_CODE: MASKED, OVL_COUNTRY: "Germany" },
      customer: { firstName: MASKED, fullName: MASKED, customerEmail: m.email("a@b.com") },
    });
    // Keys that only look personal stay.
    expect(
      maskRow("payment", { metadata: { couponName: "nurture_50", pathname: "/r" } }, m, ids)
        .metadata
    ).toEqual({ couponName: "nurture_50", pathname: "/r" });
    expect(m.unclassified()).toEqual([]);
    // A key that is itself an address or a token is masked like text.
    expect(
      maskRow("report_price_quote", { metadata: { "anna@b.com": 1, [TOKEN]: 2 } }, m, ids).metadata
    ).toEqual({ [m.email("anna@b.com")]: 1, [MASKED]: 2 });
    // Nothing to mask stays as it was, empty included.
    expect(maskRow("survey_submission", { id: 3, duration_ms: 5, utm: null }, m, ids)).toEqual({
      id: 3,
      duration_ms: 5,
      utm: null,
    });
  });

  it("stops when a column that may hold personal data has not been classified", async () => {
    const data = merge(QUESTIONS, person(1), { lead: [{ id: 1, phone_number: "+49 30 1234" }] });
    const read = reader(data);
    await expect(buildExport(specsFor(data), read)).rejects.toThrow(
      /not classified yet: lead.phone_number/
    );
    expect(read).not.toHaveBeenCalled();
    // A thing's name in a table of things is fine; a person's name column is masked anyway.
    expect(
      unclassifiedColumns([
        { name: "admin_segment", columns: ["name", "rules"], key: ["id"] },
        { name: "app_user", columns: ["first_name", "email", "utm_tracker"], key: ["id"] },
      ])
    ).toEqual([]);
    // An outside tool's id must be classified too: a new one stops the export.
    expect(
      unclassifiedColumns([
        { name: "survey_submission", columns: ["clarity_user_id"], key: ["id"] },
      ])
    ).toEqual(["survey_submission.clarity_user_id"]);
    expect(unclassifiedColumns([{ name: "partner", columns: ["name"], key: ["id"] }])).toEqual([
      "partner.name",
    ]);
  });

  it("stops when a key inside a JSON value may hold personal data and is not classified", async () => {
    const data = merge(QUESTIONS, person(1), {
      analytics_event: [{ id: 1, metadata: { device: { mobilePhone: "+49 30 1234" } } }],
    });
    await expect(buildExport(specsFor(data), reader(data))).rejects.toThrow(
      /not classified yet: analytics_event.metadata.device.mobile_phone/
    );
    // The error names keys, and a key can be an address: it is masked in the message too.
    const keyed = merge(QUESTIONS, person(1), {
      analytics_event: [{ id: 1, metadata: { "anna@gmail.com": { homePhone: "x" } } }],
    });
    const err = await buildExport(specsFor(keyed), reader(keyed)).catch((e: Error) => e);
    expect(String(err)).not.toContain("anna@gmail.com");
    expect(String(err)).toMatch(/analytics_event\.metadata\.masked-[0-9a-f]{12}\.home_phone/);
  });

  it("stops when it cannot find the email, name or postcode question, writing nothing", async () => {
    const data = merge(
      { survey_question: QUESTIONS.survey_question!.filter((q) => q.frontend_qid !== "00001") },
      person(1)
    );
    await expect(buildExport(specsFor(data), reader(data))).rejects.toThrow(
      /email, name and postcode questions/
    );
  });

  it("writes one CSV per table and the README last, with each table's rows", async () => {
    const data = merge(QUESTIONS, person(1), person(2));
    const files = await buildExport(specsFor(data), reader(data), undefined, () => "T");
    expect(files.map((f) => f.name)).toEqual([
      ...Object.keys(data)
        .sort()
        .map((t) => `${t}.csv`),
      "README.md",
    ]);
    expect(files.at(-1)!.body).toContain("Generated T from the production database.");
    expect(files.at(-1)!.body).toContain("| payment.csv | 2 |");
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

  it("stops while anyone has asked us to restrict processing, before reading anything else", async () => {
    const data = merge(QUESTIONS, person(1), person(2));
    data.app_user![1]!.processing_restricted_at = "2026-10-01T00:00:00Z";
    const read = reader(data);
    await expect(buildExport(specsFor(data), read)).rejects.toThrow(
      /1 people asked us to restrict processing/
    );
    expect(read.mock.calls.map(([spec]) => spec.name)).toEqual(["app_user"]);
    const one = merge(QUESTIONS, person(1));
    await expect(buildExport(specsFor(one), reader(one))).resolves.toHaveLength(
      Object.keys(one).length + 1
    );
  });

  it("gives up at its deadline, and says so as a timeout", async () => {
    const data = merge(QUESTIONS, person(1));
    let checks = 0;
    await expect(
      buildExport(specsFor(data), reader(data), () => ++checks > 2)
    ).rejects.toBeInstanceOf(OutOfTime);
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
      survey_question: { properties: { id: { description: pk }, frontend_qid: {} } },
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
    // Without the questions' ids, masking could not find the email answers.
    expect(() =>
      specsOf({ ...full, survey_question: { properties: { id: { description: pk } } } })
    ).toThrow(/survey_question.frontend_qid/);
  });

  it("flags test rows the way the admin panel does, and keeps them", async () => {
    const data = merge(
      QUESTIONS,
      person(1),
      person(2, { email: "eman@loveiq.org" }),
      person(3, { durationMs: 30_000 })
    );
    const emails = new Map(data.app_user!.map((u) => [u.id, String(u.email)]));
    const flags = Object.fromEntries(
      data.survey_submission!.map((s) => {
        const out = withTestFlag("survey_submission", s, emails);
        return [s.user_id, [out.is_likely_test, out.test_reasons]];
      })
    );
    expect(flags).toEqual({
      1: [false, ""],
      2: [true, "staff_email"],
      3: [true, "short_duration"],
    });
    const partials = Object.fromEntries(
      data.survey_partial_save!.map((p) => [
        p.session_id,
        withTestFlag("survey_partial_save", p, emails).is_likely_test,
      ])
    );
    expect(partials).toEqual({ "session-1": false, "session-2": true, "session-3": false });
    // The export applies it: the staff row is flagged in the file itself.
    const files = await buildExport(specsFor(data), reader(data));
    expect(csvOf(files, "survey_submission")).toContain(",true,staff_email\n");
    // And no other table gains the columns.
    expect(csvOf(files, "payment")).not.toContain("is_likely_test");
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

  it("says in the README what is masked, what is kept, what is not in it, and how to refresh", () => {
    const text = readme(
      [{ name: "app_user", columns: ["id"], key: ["id"] }],
      { app_user: 2 },
      "2026-10-10T20:00:00Z"
    );
    expect(text).toContain("| app_user.csv | 2 |");
    expect(text).toContain("Names, emails and other details that identify a person are masked");
    expect(text).toContain("every email address reads `masked-` and a code");
    expect(text).toContain("The export stops while anyone has.");
    expect(text).toMatch(/Eman, Marcus, Mark, Fatih, Sanjin, Ajna/);
    expect(text).toContain("ask Claude (Jarvis) to export all the data");
    expect(text).not.toMatch(/unmasked/i);
  });

  it("replaces exactly one Drive file per table, ours and closed, and checks them all first", () => {
    const team = [{ type: "user", emailAddress: "ec@loveiq.org" }];
    const ours = (id: string, name: string) => ({ id, name, ownedByMe: true, permissions: team });
    const files = [
      { name: "app_user.csv", body: "" },
      { name: "payment.csv", body: "" },
      { name: "README.md", body: "" },
    ];
    const folder = ["ec@loveiq.org", "mb@loveiq.org"];
    expect(plan(files, [ours("a", "app_user.csv"), ours("x", "mine.csv")], folder)).toEqual([
      "a",
      null,
      null,
    ]);
    // Every problem in the folder is named at once, before anything is written.
    const refused = () =>
      plan(
        files,
        [
          ours("a", "app_user.csv"),
          ours("b", "app_user.csv"),
          { ...ours("p", "payment.csv"), permissions: [{ type: "anyone" }] },
          { ...ours("r", "README.md"), ownedByMe: false },
        ],
        folder
      );
    expect(refused).toThrow(/2 files are named app_user.csv/);
    expect(refused).toThrow(/payment.csv: it is shared by anyone link/);
    expect(refused).toThrow(/README.md belongs to someone other than ec@/);
    expect(refused).toThrow(/Nothing written/);
    // A file shared with one outside person, which the folder's sharing does not show.
    expect(() =>
      plan(
        files,
        [
          {
            ...ours("p", "payment.csv"),
            permissions: [...team, { type: "user", emailAddress: "accountant@gmail.com" }],
          },
        ],
        folder
      )
    ).toThrow(/payment.csv: someone outside loveiq.org can open it/);
    // Or with a loveiq.org person the folder is not shared with: replies say exactly who can open it.
    expect(() =>
      plan(
        files,
        [
          {
            ...ours("p", "payment.csv"),
            permissions: [...team, { type: "user", emailAddress: "new.hire@loveiq.org" }],
          },
        ],
        folder
      )
    ).toThrow(/payment.csv is shared with someone the folder is not/);
    expect(driveQuoted("it's")).toBe("'it\\'s'");
    expect(driveQuoted("a\\b")).toBe("'a\\\\b'");
  });

  it("refuses to write inside any git repository", () => {
    const repo = resolve(__dirname, "../../..");
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

describe("the team's Drive folder", () => {
  const closed = {
    mimeType: "application/vnd.google-apps.folder",
    trashed: false,
    ownedByMe: true,
    writersCanShare: false,
    permissions: [
      { type: "user", emailAddress: "ec@loveiq.org" },
      { type: "user", emailAddress: "MB@loveiq.org" },
    ],
  };

  it("accepts a folder only loveiq.org people can open", () => {
    expect(() => assertTeamOnly(closed)).not.toThrow();
  });

  it.each([
    ["a link anyone can open", { permissions: [{ type: "anyone" }] }, /shared by anyone link/],
    ["the whole domain", { permissions: [{ type: "domain" }] }, /shared by domain link/],
    [
      "a group, even one of ours, whose members Drive does not list",
      { permissions: [{ type: "group", emailAddress: "team@loveiq.org" }] },
      /shared with a group whose members Drive does not list/,
    ],
    [
      "someone outside the company",
      { permissions: [{ type: "user", emailAddress: "someone@gmail.com" }] },
      /outside loveiq.org/,
    ],
    [
      "an address that only ends like ours",
      { permissions: [{ type: "user", emailAddress: "x@loveiq.org.evil.com" }] },
      /outside loveiq.org/,
    ],
    ["a folder ec@ does not own", { ownedByMe: false }, /does not own it/],
    ["editors who can share it on", { writersCanShare: true }, /can share it on/],
    ["a reply that leaves sharing unstated", { writersCanShare: undefined }, /can share it on/],
    ["a reply without the people on it", { permissions: undefined }, /did not say who/],
    ["a file, not a folder", { mimeType: "text/csv" }, /not a folder in use/],
    ["a folder in the bin", { trashed: true }, /not a folder in use/],
  ])("refuses %s", (_what, change, why) => {
    expect(() => assertTeamOnly({ ...closed, ...change })).toThrow(why);
  });
});

describe("Drive, with requests answered here", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const answer = (body: unknown, init: { status?: number; location?: string } = {}) =>
    new Response(init.status === 204 ? null : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: init.location ? { location: init.location } : {},
    });
  const calls = () =>
    fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: (init as RequestInit | undefined)?.method ?? "GET",
      body: (init as RequestInit | undefined)?.body,
    }));
  const team = [
    { type: "user", emailAddress: "ec@loveiq.org", displayName: "Eman Cickusic" },
    { type: "user", emailAddress: "mb@loveiq.org", displayName: "Marcus Börner" },
  ];
  const folderMeta = {
    mimeType: "application/vnd.google-apps.folder",
    trashed: false,
    ownedByMe: true,
    writersCanShare: false,
    permissions: team,
  };
  const query = (url: string) => decodeURIComponent(new URL(url).searchParams.get("q") ?? "");

  it("finds the folder by its tag among the ones ec@ owns, and says who can open it", async () => {
    fetchMock
      .mockResolvedValueOnce(answer({ files: [{ id: "F1" }] }))
      .mockResolvedValueOnce(answer(folderMeta));
    await expect(findTeamFolder("tok")).resolves.toEqual({
      id: "F1",
      people: ["Eman Cickusic", "Marcus Börner"],
    });
    const q = query(calls()[0]!.url);
    // Owned, because anyone can share a tagged folder with ec@: this repository is public.
    expect(q).toContain("'me' in owners");
    expect(q).toContain("properties has { key='loveiq_team_export' and value='production' }");
    expect(q).toContain("trashed=false");
    expect(calls()[1]!.url).toContain("/drive/v3/files/F1?fields=");
  });

  it("stops when no folder, or more than one, carries the tag", async () => {
    fetchMock.mockResolvedValueOnce(answer({ files: [] }));
    await expect(findTeamFolder("tok")).rejects.toThrow(/0 of ec@'s Drive folders carry/);
    fetchMock.mockResolvedValueOnce(answer({ files: [{ id: "a" }, { id: "b" }] }));
    await expect(findTeamFolder("tok")).rejects.toThrow(/2 of ec@'s Drive folders carry/);
  });

  it("stops when the tagged folder has been opened to others", async () => {
    fetchMock
      .mockResolvedValueOnce(answer({ files: [{ id: "F1" }] }))
      .mockResolvedValueOnce(answer({ ...folderMeta, permissions: [{ type: "anyone" }] }));
    await expect(findTeamFolder("tok")).rejects.toThrow(/not team-only/);
  });

  it("checks the folder and its files again right before writing, then creates or replaces each", async () => {
    fetchMock
      // The folder, checked again, then every file in it, in one listing.
      .mockResolvedValueOnce(answer(folderMeta))
      .mockResolvedValueOnce(
        answer({ files: [{ id: "OLD", name: "README.md", ownedByMe: true, permissions: team }] })
      )
      // New file: created in the folder.
      .mockResolvedValueOnce(answer({}, { location: "https://upload/session-1" }))
      .mockResolvedValueOnce(answer({ id: "NEW" }))
      .mockResolvedValueOnce(answer({ revisions: [{ id: "r1" }] }))
      // Existing file: replaced in place, and its older version deleted.
      .mockResolvedValueOnce(answer({}, { location: "https://upload/session-2" }))
      .mockResolvedValueOnce(answer({ id: "OLD" }))
      .mockResolvedValueOnce(answer({ revisions: [{ id: "r1" }, { id: "r2" }] }))
      .mockResolvedValueOnce(answer({}, { status: 204 }));
    await uploadExport("tok", "F1", [
      { name: "app_user.csv", body: "id\n1\n" },
      { name: "README.md", body: "# readme" },
    ]);
    const c = calls();
    expect(c[0]!.url).toContain("/drive/v3/files/F1?fields=");
    // The listing is of this folder only, and of files not in the bin.
    expect(query(c[1]!.url)).toBe("'F1' in parents and trashed=false");
    expect(c[2]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(c[2]!.body))).toEqual({
      name: "app_user.csv",
      parents: ["F1"],
      writersCanShare: false,
    });
    expect(c[3]).toMatchObject({ url: "https://upload/session-1", method: "PUT" });
    expect(c[3]!.body).toBe("id\n1\n");
    expect(c[5]).toMatchObject({ method: "PATCH" });
    expect(c[5]!.url).toContain("/upload/drive/v3/files/OLD?uploadType=resumable");
    expect(JSON.parse(String(c[5]!.body))).toEqual({ writersCanShare: false });
    expect(c[6]!.body).toBe("# readme");
    // Only the older version goes; the one just uploaded stays.
    expect(c[8]).toMatchObject({ method: "DELETE" });
    expect(c[8]!.url).toContain("/files/OLD/revisions/r1");
    expect(c).toHaveLength(9);
  });

  it("writes nothing when any file in the folder fails the check", async () => {
    fetchMock.mockResolvedValueOnce(answer(folderMeta)).mockResolvedValueOnce(
      answer({
        files: [
          { id: "P", name: "payment.csv", ownedByMe: true, permissions: [{ type: "anyone" }] },
        ],
      })
    );
    await expect(
      uploadExport("tok", "F1", [
        { name: "app_user.csv", body: "" },
        { name: "payment.csv", body: "" },
      ])
    ).rejects.toThrow(/payment.csv: it is shared by anyone link/);
    expect(calls().filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("retries a passing Drive error once, after two seconds, and only that kind", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(answer({}, { status: 503 }))
      .mockResolvedValueOnce(answer(folderMeta))
      .mockResolvedValueOnce(answer({ files: [] }));
    const found = uploadExport("tok", "F1", []);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(found).resolves.toBeUndefined();
    expect(calls()[0]!.url).toBe(calls()[1]!.url);

    // Once only: a second 503 is the answer.
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(answer({}, { status: 503 }))
      .mockResolvedValueOnce(answer({}, { status: 503 }))
      .mockResolvedValueOnce(answer(folderMeta));
    const twice = uploadExport("tok", "F1", []);
    const refused = expect(twice).rejects.toThrow("Drive could not read the folder (503)");
    await vi.runAllTimersAsync();
    await refused;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A rate-limit 403 is passing; any other 403 is an answer.
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        answer({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }, { status: 403 })
      )
      .mockResolvedValueOnce(answer(folderMeta))
      .mockResolvedValueOnce(answer({ files: [] }));
    const limited = uploadExport("tok", "F1", []);
    await vi.runAllTimersAsync();
    await expect(limited).resolves.toBeUndefined();
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(answer({ error: "forbidden" }, { status: 403 }));
    await expect(uploadExport("tok", "F1", [])).rejects.toThrow("(403)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never retries the upload itself, and never repeats a URL when a request fails", async () => {
    fetchMock
      .mockResolvedValueOnce(answer(folderMeta))
      .mockResolvedValueOnce(answer({ files: [] }))
      .mockResolvedValueOnce(answer({}, { location: "https://upload/session-1" }))
      .mockResolvedValueOnce(answer({}, { status: 503 }));
    await expect(uploadExport("tok", "F1", [{ name: "a.csv", body: "x" }])).rejects.toThrow(
      "Drive upload of a.csv failed: 503"
    );
    expect(calls().filter((c) => c.method === "PUT")).toHaveLength(1);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(answer(folderMeta))
      .mockResolvedValueOnce(answer({ files: [] }))
      .mockResolvedValueOnce(answer({}, { location: "https://upload/SECRET-SESSION" }))
      .mockRejectedValueOnce(
        new Error("Request timeout after 90000ms: https://upload/SECRET-SESSION")
      );
    const failed = uploadExport("tok", "F1", [{ name: "a.csv", body: "x" }]);
    await expect(failed).rejects.toThrow("Drive upload of a.csv timed out");
    await expect(failed).rejects.not.toThrow(/SECRET-SESSION/);
  });

  it("takes an old version that is already gone as gone", async () => {
    fetchMock
      .mockResolvedValueOnce(answer(folderMeta))
      .mockResolvedValueOnce(
        answer({ files: [{ id: "OLD", name: "a.csv", ownedByMe: true, permissions: team }] })
      )
      .mockResolvedValueOnce(answer({}, { location: "https://upload/session-1" }))
      .mockResolvedValueOnce(answer({ id: "OLD" }))
      .mockResolvedValueOnce(answer({ revisions: [{ id: "r1" }, { id: "r2" }] }))
      .mockResolvedValueOnce(answer({}, { status: 404 }));
    await expect(
      uploadExport("tok", "F1", [{ name: "a.csv", body: "x" }])
    ).resolves.toBeUndefined();
  });

  it("stops uploading at its deadline, before asking Drive anything", async () => {
    await expect(
      uploadExport("tok", "F1", [{ name: "a.csv", body: "" }], () => true)
    ).rejects.toBeInstanceOf(OutOfTime);
    expect(fetchMock).not.toHaveBeenCalled();
    // And between files: the check before each one stops the rest.
    fetchMock
      .mockResolvedValueOnce(answer(folderMeta))
      .mockResolvedValueOnce(answer({ files: [] }));
    let checks = 0;
    await expect(
      uploadExport("tok", "F1", [{ name: "a.csv", body: "" }], () => ++checks > 1)
    ).rejects.toBeInstanceOf(OutOfTime);
    expect(calls().filter((c) => c.method !== "GET")).toHaveLength(0);
  });
});

describe("reading the database", () => {
  const page = (rows: unknown[]) => new Response(JSON.stringify(rows));
  const users = { name: "app_user", columns: ["id", "processing_restricted_at"], key: ["id"] };
  const questions = { name: "survey_question", columns: ["id", "frontend_qid"], key: ["id"] };
  const asked = page([
    { id: 1, frontend_qid: "00000" },
    { id: 2, frontend_qid: "00001" },
  ]);
  beforeEach(() => pages.fetch.mockReset());

  it("reads page after page by key, and checks the deadline before each page", async () => {
    pages.fetch
      .mockResolvedValueOnce(page([{ id: 1 }, { id: 2 }]))
      .mockResolvedValueOnce(page([{ id: 3 }]))
      .mockResolvedValueOnce(asked)
      .mockResolvedValueOnce(page([{ id: 40, frontend_qid: "15002" }]));
    const files = await buildExport([users, questions]);
    expect(pages.fetch.mock.calls.map(([p]) => p)).toEqual([
      "/rest/v1/app_user?select=*&order=id.asc&limit=2",
      "/rest/v1/app_user?select=*&order=id.asc&limit=2&id=gt.2",
      "/rest/v1/survey_question?select=*&order=id.asc&limit=2",
      "/rest/v1/survey_question?select=*&order=id.asc&limit=2&id=gt.2",
    ]);
    expect(files[0]!.body).toBe("id,processing_restricted_at\n1,\n2,\n3,\n");

    pages.fetch.mockReset().mockResolvedValue(page([{ id: 1 }, { id: 2 }]));
    let checks = 0;
    await expect(
      buildExport([users, questions], undefined, () => ++checks > 1)
    ).rejects.toBeInstanceOf(OutOfTime);
    // One page read, then the deadline stopped the second: inside the table, not after it.
    expect(pages.fetch).toHaveBeenCalledTimes(1);
  });
});
