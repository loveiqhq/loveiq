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

import {
  assertTeamOnly,
  buildExport,
  csvCell,
  driveQuoted,
  fileToReplace,
  findTeamFolder,
  isExported,
  OutOfTime,
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
    user_profile: [{ id: id * 7, gender: "woman", sexual_orientation: "bisexual" }],
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
  it("changes nothing in the data: emails, names, answers, report links, payments", async () => {
    const data = merge(person(1), person(2));
    const specs = specsFor(data);
    const files = await buildExport(specs, reader(data));
    for (const spec of specs) {
      if (spec.name === "survey_submission" || spec.name === "survey_partial_save") continue;
      expect(csvOf(files, spec.name), spec.name).toBe(toCsv(data[spec.name]!, spec.columns));
    }
    // The two flagged tables keep every column they had, plus the flags.
    const submissions = csvOf(files, "survey_submission");
    expect(submissions.split("\n")[0]).toBe(
      "id,user_id,session_id,duration_ms,regeneration_url,is_likely_test,test_reasons"
    );
    expect(submissions).toContain(TOKEN);
    expect(csvOf(files, "app_user")).toContain("person2@example.com");
  });

  it("writes one CSV per table and the README last, with each table's rows", async () => {
    const data = merge(person(1), person(2));
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
    const data = merge(person(1), person(2));
    data.app_user![1]!.processing_restricted_at = "2026-10-01T00:00:00Z";
    const read = reader(data);
    await expect(buildExport(specsFor(data), read)).rejects.toThrow(
      /1 people asked us to restrict processing/
    );
    expect(read.mock.calls.map(([spec]) => spec.name)).toEqual(["app_user"]);
    await expect(buildExport(specsFor(merge(person(1))), reader(person(1)))).resolves.toHaveLength(
      Object.keys(person(1)).length + 1
    );
  });

  it("gives up at its deadline, and says so as a timeout", async () => {
    const data = person(1);
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

  it("flags test rows the way the admin panel does, and keeps them", async () => {
    const data = merge(
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

  it("says in the README what is in it, what is not, and how to get a fresh one", () => {
    const text = readme(
      [{ name: "app_user", columns: ["id"], key: ["id"] }],
      { app_user: 2 },
      "2026-10-10T20:00:00Z"
    );
    expect(text).toContain("| app_user.csv | 2 |");
    expect(text).toContain("The export stops while anyone has.");
    expect(text).toMatch(/Eman, Marcus, Mark, Fatih, Sanjin, Ajna/);
    expect(text).toContain("ask Claude (Jarvis) to export all the data");
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
      { type: "group", emailAddress: "team@loveiq.org" },
    ],
  };

  it("accepts a folder only the team can open", () => {
    expect(() => assertTeamOnly(closed)).not.toThrow();
  });

  it.each([
    ["a link anyone can open", { permissions: [{ type: "anyone" }] }, /shared by anyone link/],
    ["the whole domain", { permissions: [{ type: "domain" }] }, /shared by domain link/],
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
  const folderMeta = {
    mimeType: "application/vnd.google-apps.folder",
    trashed: false,
    ownedByMe: true,
    writersCanShare: false,
    permissions: [{ type: "user", emailAddress: "ec@loveiq.org" }],
  };

  it("finds the folder by its tag among the ones ec@ owns, and checks it before using it", async () => {
    fetchMock
      .mockResolvedValueOnce(answer({ files: [{ id: "F1" }] }))
      .mockResolvedValueOnce(answer(folderMeta));
    await expect(findTeamFolder("tok")).resolves.toBe("F1");
    const q = decodeURIComponent(new URL(calls()[0]!.url).searchParams.get("q")!);
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

  it("creates or replaces each file with sharing kept to the owner, README last", async () => {
    // New file: search finds none, so it is created in the folder.
    fetchMock
      .mockResolvedValueOnce(answer({ files: [] }))
      .mockResolvedValueOnce(answer({}, { location: "https://upload/session-1" }))
      .mockResolvedValueOnce(answer({ id: "NEW" }))
      .mockResolvedValueOnce(answer({ revisions: [{ id: "r1" }] }))
      // Existing file: replaced in place, and its older version deleted.
      .mockResolvedValueOnce(answer({ files: [{ id: "OLD" }] }))
      .mockResolvedValueOnce(answer({}, { location: "https://upload/session-2" }))
      .mockResolvedValueOnce(answer({ id: "OLD" }))
      .mockResolvedValueOnce(answer({ revisions: [{ id: "r1" }, { id: "r2" }] }))
      .mockResolvedValueOnce(answer({}, { status: 204 }));
    await uploadExport("tok", "F1", [
      { name: "app_user.csv", body: "id\n1\n" },
      { name: "README.md", body: "# readme" },
    ]);
    const c = calls();
    expect(c[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(c[1]!.body))).toEqual({
      name: "app_user.csv",
      parents: ["F1"],
      writersCanShare: false,
    });
    expect(c[2]).toMatchObject({ url: "https://upload/session-1", method: "PUT" });
    expect(c[2]!.body).toBe("id\n1\n");
    expect(c[5]).toMatchObject({ method: "PATCH" });
    expect(c[5]!.url).toContain("/upload/drive/v3/files/OLD?uploadType=resumable");
    expect(JSON.parse(String(c[5]!.body))).toEqual({ writersCanShare: false });
    expect(c[6]!.body).toBe("# readme");
    // Only the older version goes; the one just uploaded stays.
    expect(c[8]).toMatchObject({ method: "DELETE" });
    expect(c[8]!.url).toContain("/files/OLD/revisions/r1");
    expect(c).toHaveLength(9);
  });

  it("stops uploading at its deadline", async () => {
    await expect(
      uploadExport("tok", "F1", [{ name: "a.csv", body: "" }], () => true)
    ).rejects.toBeInstanceOf(OutOfTime);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
