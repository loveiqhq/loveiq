import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: vi.fn(),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
const mockHogql = vi.fn();
vi.mock("@features/ux-review/server/review", () => ({
  hogqlTable: (...args: unknown[]) => mockHogql(...args),
}));

import {
  buildCatalog,
  cleanComment,
  dateFieldsOf,
  groupOf,
  schemaOf,
  type CatalogTable,
} from "@features/admin/server/ap/catalog";
import {
  checkQuery,
  effectiveOrder,
  checkUnlock,
  maskForExplorer,
  posthogRows,
  productionRows,
  readableSql,
  Refused,
  signUnlock,
  type ExplorerQuery,
} from "@features/admin/server/ap/explorer";
import { berlinTime } from "@features/admin/server/ap/explorer-spec";
import { columnPrivacy, masker, MASKED } from "@features/admin/server/team-export";

const DEFS = {
  app_user: {
    properties: {
      id: { type: "integer", format: "bigint", description: "Note:\nThis is a Primary Key.<pk/>" },
      email: { type: "string", format: "text" },
      first_name: { type: "string", format: "text" },
      created_date_time: { type: "string", format: "timestamp with time zone" },
    },
  },
  survey_submission_answer: {
    description: "One row per answered question.",
    properties: {
      id: { type: "integer", format: "bigint", description: "Note:\nThis is a Primary Key.<pk/>" },
      survey_question_id: {
        type: "integer",
        format: "bigint",
        description:
          "Note:\nThis is a Foreign Key to `survey_question.id`.<fk table='survey_question' column='id'/>",
      },
      answer_text: { type: "string", format: "text" },
      created_date_time: { type: "string", format: "timestamp with time zone" },
    },
  },
  payment: {
    properties: {
      id: { type: "integer", format: "bigint", description: "<pk/>" },
      amount: { type: "number", format: "numeric" },
      status: { type: "string", format: "text", description: "Stripe status." },
      metadata: { format: "jsonb" },
      paid: { type: "boolean", format: "boolean" },
      created_date_time: { type: "string", format: "timestamp with time zone" },
    },
  },
  funnel_event: {
    properties: {
      visitor_id: { type: "string", format: "uuid", description: "<pk/>" },
      day: { type: "string", format: "date", description: "<pk/>" },
      event_type: { type: "string", format: "text", description: "<pk/>" },
    },
  },
  brain_chunk: { properties: { id: { type: "integer", format: "bigint" } } },
  rate_limits: { properties: { id: { type: "integer", format: "bigint" } } },
};

const catalog = buildCatalog(schemaOf(DEFS), []);
const table = (name: string) => catalog.find((t) => t.name === name) as CatalogTable;
const q = (over: Partial<ExplorerQuery> = {}): ExplorerQuery => ({
  dateField: "created_date_time",
  from: "2026-10-01",
  to: "2026-10-12",
  filters: [],
  columns: ["id"],
  sort: null,
  dir: "desc",
  page: 1,
  size: 50,
  cursor: null,
  ...over,
});

describe("data catalog", () => {
  it("reads the schema the export copies, with types, keys and joins", () => {
    expect(catalog.filter((t) => t.source === "production").map((t) => t.name)).toEqual([
      "survey_submission_answer",
      "payment",
      "funnel_event",
      "app_user",
    ]);
    const answer = table("survey_submission_answer");
    expect(answer.key).toEqual(["id"]);
    expect(answer.fields.find((f) => f.name === "survey_question_id")).toMatchObject({
      joins: "survey_question.id",
      pk: false,
      type: "bigint",
    });
    expect(answer.fields.find((f) => f.name === "created_date_time")?.type).toBe("timestamptz");
    expect(table("funnel_event").key).toEqual(["visitor_id", "day", "event_type"]);
    expect(
      cleanComment(
        "Note:\nThis is a Foreign Key to `app_user.id`.<fk table='app_user' column='id'/>"
      )
    ).toBe("");
  });

  it("groups tables and picks the date a range filters on", () => {
    expect(groupOf("report_price_quote")).toBe("Revenue");
    expect(groupOf("report_session")).toBe("Report");
    expect(groupOf("survey_partial_save")).toBe("Survey");
    expect(groupOf("admin_users")).toBe("Admin & tools");
    expect(
      dateFieldsOf([
        { name: "saved_at", type: "timestamptz" },
        { name: "created_at", type: "timestamptz" },
      ])
    ).toEqual(["created_at", "saved_at"]);
    expect(table("funnel_event").dateFields).toEqual(["day"]);
  });

  it("describes a field by the team's note, else the draft, else the database's comment", () => {
    const notes = [
      {
        source: "production",
        relation: "payment",
        field: "status",
        description: "Ours.",
        updated_by: "mb@loveiq.org",
        updated_at: "2026-10-13T10:00:00Z",
      },
      {
        source: "production",
        relation: "payment",
        field: "",
        description: "Our table.",
        updated_by: "mb@loveiq.org",
        updated_at: "2026-10-13T10:00:00Z",
      },
    ];
    const withNotes = buildCatalog(schemaOf(DEFS), notes).find((t) => t.name === "payment")!;
    expect(withNotes.fields.find((f) => f.name === "status")).toMatchObject({
      description: "Ours.",
      origin: "team",
      editedBy: "mb",
    });
    expect(withNotes).toMatchObject({ description: "Our table.", origin: "team" });
    // The draft for amount; nothing at all for paid.
    expect(withNotes.fields.find((f) => f.name === "amount")).toMatchObject({
      origin: "draft",
      description: "Amount charged, in euros.",
    });
    expect(withNotes.fields.find((f) => f.name === "paid")).toMatchObject({
      origin: "none",
      description: "",
    });
    expect(table("survey_submission_answer")).toMatchObject({ origin: "draft" });
  });

  it("lists a table's joins both ways: the tables it points to and those pointing to it", () => {
    const fk = (table: string) => ({
      format: "bigint",
      description: `<fk table='${table}' column='id'/>`,
    });
    const joined = buildCatalog(
      schemaOf({
        app_user: { properties: { id: { format: "bigint", description: "<pk/>" } } },
        payment: { properties: { id: { format: "bigint" }, user_id: fk("app_user") } },
        survey_submission: {
          properties: {
            id: { format: "bigint" },
            user_id: fk("app_user"),
            parent: fk("survey_submission"),
          },
        },
      }),
      []
    );
    const joins = (name: string) => joined.find((t) => t.name === name)?.joins;
    expect(joins("app_user")).toEqual(["payment", "survey_submission"]);
    expect(joins("payment")).toEqual(["app_user"]);
    // A key to its own table is not a join to another.
    expect(joins("survey_submission")).toEqual(["app_user"]);
    expect(table("survey_submission_answer").joins).toEqual(["survey_question"]);
  });

  it("writes stored days and times in Berlin time", () => {
    // Summer time, PostgREST's six decimals; winter time across midnight.
    expect(berlinTime("2026-10-13T08:52:11.123456+00:00", ", ")).toBe("13 Oct 2026, 10:52");
    expect(berlinTime("2026-12-31T23:30:00Z")).toBe("1 Jan 2027 00:30");
    expect(berlinTime("2026-09-02")).toBe("2 Sep 2026");
    expect(berlinTime("12345")).toBeNull();
  });

  it("flags personal fields as the team copy masks them", () => {
    expect(columnPrivacy("app_user", "email")).toBe("masked");
    expect(columnPrivacy("app_user", "first_name")).toBe("masked");
    expect(columnPrivacy("survey_submission_answer", "answer_text")).toBe("partly");
    expect(columnPrivacy("survey_partial_save", "answers")).toBe("partly");
    expect(columnPrivacy("payment", "amount")).toBeNull();
    expect(table("app_user").fields.find((f) => f.name === "email")?.privacy).toBe("masked");
  });
});

describe("explorer query checks", () => {
  const refuse = (t: CatalogTable, query: ExplorerQuery, masked = true) => {
    try {
      checkQuery(t, query, masked);
      return null;
    } catch (err) {
      expect(err).toBeInstanceOf(Refused);
      return (err as Error).message;
    }
  };

  it("keeps a masked reader from finding or ranking people by a personal field", () => {
    expect(
      refuse(
        table("app_user"),
        q({ filters: [{ column: "email", op: "contains", value: "gmail" }] })
      )
    ).toMatch(/needs the table unlocked/);
    expect(refuse(table("app_user"), q({ sort: "first_name" }))).toMatch(
      /needs the table unlocked/
    );
    expect(
      refuse(
        table("payment"),
        q({ filters: [{ column: "status", op: "eq", value: "someone@example.com" }] })
      )
    ).toMatch(/email address/);
    expect(
      refuse(
        table("payment"),
        q({ filters: [{ column: "status", op: "contains", value: "rpt_abc" }] })
      )
    ).toMatch(/report link/);
    // Unlocked, the same filter is allowed.
    expect(
      refuse(
        table("app_user"),
        q({ filters: [{ column: "email", op: "contains", value: "gmail" }] }),
        false
      )
    ).toBeNull();
  });

  it("closes the ways round the masked filters the security review found", () => {
    // Ranging over text brackets an address letter by letter without typing it.
    expect(
      refuse(table("payment"), q({ filters: [{ column: "status", op: "gt", value: "jane.doe" }] }))
    ).toMatch(/matched, not ranged/);
    expect(
      refuse(table("payment"), q({ filters: [{ column: "amount", op: "gt", value: "5" }] }))
    ).toBeNull();
    // Share and prepaid links are tokens too.
    expect(
      refuse(
        table("payment"),
        q({ filters: [{ column: "status", op: "contains", value: "rpts_abc" }] })
      )
    ).toMatch(/report link/);
    expect(
      refuse(
        table("payment"),
        q({ filters: [{ column: "status", op: "contains", value: "rpp_abc" }] })
      )
    ).toMatch(/report link/);
    // Searching inside text spells out, a letter at a time, what the mask hides: a report
    // link or an address inside a page address. Whole values only, until unlocked.
    const events = catalog.find((t) => t.source === "posthog" && t.name === "events")!;
    const inside = (t: CatalogTable, column: string, value: string, masked = true) =>
      refuse(
        t,
        q({
          dateField: t.source === "posthog" ? "timestamp" : "created_date_time",
          columns: [column],
          filters: [{ column, op: "contains", value }],
        }),
        masked
      );
    expect(inside(events, "properties.$pathname", "pt_Ab3")).toMatch(/matched whole/);
    expect(inside(table("payment"), "status", "succ")).toMatch(/matched whole/);
    expect(inside(events, "properties.$pathname", "pt_Ab3", false)).toBeNull();
    expect(
      refuse(table("payment"), q({ filters: [{ column: "status", op: "eq", value: "succeeded" }] }))
    ).toBeNull();
    // A personal date as the range.
    const profile = buildCatalog(
      schemaOf({
        user_profile: {
          properties: {
            id: { format: "bigint", description: "<pk/>" },
            birthday: { format: "date" },
          },
        },
      }),
      []
    )[0]!;
    expect(refuse(profile, q({ dateField: "birthday" }))).toMatch(/needs the table unlocked/);
  });

  it("escapes the one-letter wildcard, and never orders a masked page by a personal field", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-range": "*/0" }),
      json: async () => [],
    });
    await productionRows(
      table("payment"),
      q({ filters: [{ column: "status", op: "contains", value: "a_b" }] }),
      true,
      new Date()
    );
    expect(decodeURIComponent(mockSupabaseFetch.mock.calls[0]![0] as string)).toContain(
      "status=ilike.*a\\_b*"
    );
    const emailKeyed = buildCatalog(
      schemaOf({
        email_suppression: {
          properties: {
            email: { format: "text", description: "<pk/>" },
            reason: { format: "text" },
          },
        },
      }),
      []
    )[0]!;
    expect(
      effectiveOrder(emailKeyed, q({ dateField: null, columns: ["email", "reason"] }), true).column
    ).toBe("reason");
    expect(
      effectiveOrder(emailKeyed, q({ dateField: null, columns: ["email", "reason"] }), false).column
    ).toBe("email");
  });

  it("masks whole a column that looks personal but no list classifies", () => {
    const t = buildCatalog(
      schemaOf({
        survey_x: {
          properties: {
            id: { format: "bigint", description: "<pk/>" },
            phone_hint: { format: "text" },
          },
        },
      }),
      []
    )[0]!;
    expect(t.fields.find((f) => f.name === "phone_hint")).toMatchObject({
      privacy: "masked",
      unlisted: true,
    });
  });

  it("refuses unknown fields and filters a type cannot take", () => {
    expect(refuse(table("payment"), q({ columns: ["id", "nope"] }))).toMatch(/no field nope/);
    expect(refuse(table("payment"), q({ dateField: "amount" }))).toMatch(/not a date field/);
    expect(
      refuse(table("payment"), q({ filters: [{ column: "metadata", op: "eq", value: "x" }] }))
    ).toMatch(/empty or not empty/);
    expect(
      refuse(table("payment"), q({ filters: [{ column: "metadata", op: "notnull", value: "" }] }))
    ).toBeNull();
    expect(
      refuse(table("payment"), q({ filters: [{ column: "amount", op: "gt", value: "ten" }] }))
    ).toMatch(/takes a number/);
    expect(
      refuse(table("payment"), q({ filters: [{ column: "paid", op: "gt", value: "1" }] }))
    ).toMatch(/yes or no/);
    expect(
      refuse(table("payment"), q({ filters: [{ column: "status", op: "eq", value: " " }] }))
    ).toMatch(/needs a value/);
    expect(refuse(table("payment"), q({ columns: [] }))).toMatch(/at least one column/);
  });

  it("writes the query as readable SQL with Berlin's day bounds", () => {
    const sql = readableSql(
      table("payment"),
      q({
        columns: ["id", "amount"],
        filters: [{ column: "status", op: "in", value: "succeeded, it's" }],
      }),
      true
    );
    expect(sql).toContain("created_date_time >= '2026-09-30T22:00:00.000Z'");
    expect(sql).toContain("created_date_time < '2026-10-12T22:00:00.000Z'");
    expect(sql).toContain("status IN ('succeeded', 'it''s')");
    expect(sql).toContain("ORDER BY created_date_time DESC NULLS LAST");
    expect(sql).toContain("LIMIT 50 OFFSET 0;");
  });
});

describe("explorer unlock", () => {
  beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("unlocks one table, for one admin, until it ends, and nothing tampered", () => {
    const now = Date.now();
    const token = signUnlock("mb@loveiq.org", "production.app_user", now + 60_000);
    expect(checkUnlock(token, "mb@loveiq.org", "production.app_user", now)).toBe(true);
    expect(checkUnlock(token, "mo@loveiq.org", "production.app_user", now)).toBe(false);
    expect(checkUnlock(token, "mb@loveiq.org", "production.payment", now)).toBe(false);
    expect(checkUnlock(token, "mb@loveiq.org", "production.app_user", now + 61_000)).toBe(false);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ e: "mb@loveiq.org", t: "production.payment", x: now + 60_000 })
    ).toString("base64url");
    expect(checkUnlock(`${forged}.${sig}`, "mb@loveiq.org", "production.payment", now)).toBe(false);
    expect(checkUnlock(`${body}.x${sig}`, "mb@loveiq.org", "production.app_user", now)).toBe(false);
    expect(checkUnlock(null, "mb@loveiq.org", "production.app_user", now)).toBe(false);
  });
});

describe("explorer masking", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    mockSupabaseFetch.mockReset();
    mockHogql.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("masks a row as the team copy does, and a JSON key no list knows by its whole column", () => {
    const key = Buffer.alloc(32, 1);
    const out = maskForExplorer(
      "app_user",
      {
        id: 1,
        email: "Someone@Example.com",
        first_name: "Ana",
        note: { instagram_handle: "@ana", plan: "full" },
      },
      () => masker(key),
      new Set()
    );
    expect(out.email).toMatch(/^masked-[0-9a-f]{12}$/);
    expect(out.first_name).toBe(MASKED);
    expect(out.note).toBe(MASKED);
    expect(out.id).toBe(1);
  });

  it("reads the question id it needs to mask an answer, then shows only the chosen columns", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-range": "0-1/2" }),
        json: async () => [
          { id: 1, answer_text: "ana@example.com", survey_question_id: 900 },
          { id: 2, answer_text: "Sometimes", survey_question_id: 15 },
        ],
      })
      // survey_question: the email, name and postcode questions
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 900 }, { id: 901 }, { id: 902 }],
      });
    const r = await productionRows(
      table("survey_submission_answer"),
      q({ columns: ["id", "answer_text"] }),
      true,
      new Date("2026-10-13T12:00:00Z")
    );
    const path = mockSupabaseFetch.mock.calls[0]![0] as string;
    expect(path).toContain("select=id,answer_text,survey_question_id");
    expect(path).toContain("order=created_date_time.desc.nullslast,id.desc");
    expect(mockSupabaseFetch.mock.calls[0]![1]).toMatchObject({
      headers: { Prefer: "count=exact", Range: "0-49" },
    });
    expect(r.rows).toEqual([
      { id: 1, answer_text: MASKED },
      { id: 2, answer_text: "Sometimes" },
    ]);
    expect(r).toMatchObject({ total: 2, masked: true, columns: ["id", "answer_text"] });
  });

  it("answers a page past the end with no rows, and a refused filter with its reason", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: false,
      status: 416,
      headers: new Headers({ "content-range": "*/12" }),
      json: async () => ({}),
    });
    const r = await productionRows(table("payment"), q({ page: 9 }), true, new Date());
    expect(r).toMatchObject({ rows: [], total: 12 });
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({}),
    });
    await expect(productionRows(table("payment"), q(), true, new Date())).rejects.toBeInstanceOf(
      Refused
    );
  });

  it("pages PostHog by time and masks report links in it", async () => {
    const events = catalog.find((t) => t.source === "posthog" && t.name === "events")!;
    mockHogql
      .mockResolvedValueOnce({
        ok: true,
        cut: false,
        rows: [
          ["2026-10-12T21:00:00.500000+02:00", "$pageview", "/report/rpt_secretToken123"],
          ["2026-10-12T20:00:00.250000+02:00", "$pageview", "/"],
        ],
      })
      .mockResolvedValueOnce({ ok: true, cut: false, rows: [[7]] });
    const r = await posthogRows(
      events,
      q({
        dateField: "timestamp",
        columns: ["event", "properties.$pathname"],
        size: 2,
        cursor: "2026-10-12T20:00:00.000Z",
      }),
      true,
      new Date()
    );
    const sql = mockHogql.mock.calls[0]![0] as string;
    expect(sql).toContain("timestamp < toDateTime64('2026-10-12 20:00:00.000', 3, 'UTC')");
    expect(sql).not.toContain("OFFSET");
    expect(r.rows).toEqual([
      { event: "$pageview", "properties.$pathname": `/report/${MASKED}` },
      { event: "$pageview", "properties.$pathname": "/" },
    ]);
    expect(r.next).toBe("2026-10-12T18:00:00.250Z");
    expect(r.total).toBe(7);
    await expect(
      posthogRows(events, q({ sort: "event", columns: ["event"] }), true, new Date())
    ).rejects.toThrow(/by time only/);
  });

  it("masks an identified reader's PostHog id whole, and every kind of report link", async () => {
    const events = catalog.find((t) => t.source === "posthog" && t.name === "events")!;
    mockHogql
      .mockResolvedValueOnce({
        ok: true,
        cut: false,
        rows: [
          // An address the text rule misses (a non-Latin domain): the id is masked whole.
          ["2026-10-12T21:00:00+02:00", "ana@bücher.de", "/r/rpts_Ab-1 then rpp_x9"],
          ["2026-10-12T20:00:00+02:00", "0192a7c4-anon", "/report/rpt_q"],
        ],
      })
      .mockResolvedValueOnce({ ok: true, cut: false, rows: [[2]] });
    const r = await posthogRows(
      events,
      q({ dateField: "timestamp", columns: ["distinct_id", "properties.$pathname"] }),
      true,
      new Date()
    );
    expect(r.rows[0]?.distinct_id).toMatch(/^masked-[0-9a-f]{12}$/);
    expect(
      events.fields.find((f) => f.name === "$session_id")?.privacy,
      "the session id opens the visit's recording: masked as the team copy masks it"
    ).toBe("masked");
    expect(r.rows[0]?.["properties.$pathname"]).toBe(`/r/${MASKED} then ${MASKED}`);
    expect(r.rows[1]).toEqual({
      distinct_id: "0192a7c4-anon",
      "properties.$pathname": `/report/${MASKED}`,
    });
  });

  it("masks whole, in the rows, a column that looks personal but no list classifies", async () => {
    const t = buildCatalog(
      schemaOf({
        survey_x: {
          properties: {
            id: { format: "bigint", description: "<pk/>" },
            phone_hint: { format: "text" },
            created_date_time: { format: "timestamp with time zone" },
          },
        },
      }),
      []
    )[0]!;
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-range": "0-0/1" }),
      json: async () => [{ id: 1, phone_hint: "+49 170 1234567" }],
    });
    const r = await productionRows(t, q({ columns: ["id", "phone_hint"] }), true, new Date());
    expect(r.rows).toEqual([{ id: 1, phone_hint: MASKED }]);
  });

  it("masks the PostHog session id whole while masked, and keeps filters off it", async () => {
    const events = catalog.find((t) => t.source === "posthog" && t.name === "events")!;
    mockHogql
      .mockResolvedValueOnce({
        ok: true,
        cut: false,
        rows: [["2026-10-12T21:00:00+02:00", "01920000-sess", "$pageview"]],
      })
      .mockResolvedValueOnce({ ok: true, cut: false, rows: [[1]] });
    const r = await posthogRows(
      events,
      q({ dateField: "timestamp", columns: ["$session_id", "event"] }),
      true,
      new Date()
    );
    expect(r.rows).toEqual([{ $session_id: MASKED, event: "$pageview" }]);
    expect(() =>
      checkQuery(
        events,
        q({
          dateField: "timestamp",
          columns: ["event"],
          filters: [{ column: "$session_id", op: "eq", value: "01920000-sess" }],
        }),
        true
      )
    ).toThrow(/unlocked/);
  });
});
