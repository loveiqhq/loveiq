// @vitest-environment jsdom
/**
 * The design sync of the Data sources catalog and the raw data explorer (21 Oct 2026): the
 * table order, joins both ways, how each table is fed, free text tagged Partly PII, the info
 * icons, the explorer's table order, appended columns and its save form.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCatalog, schemaOf, type CatalogPayload } from "@features/admin/server/ap/catalog";
import { checkQuery } from "@features/admin/server/ap/explorer";
import type { ExplorerResult } from "@features/admin/server/ap/explorer-spec";
import { FIELDS } from "@features/admin/ui/ap/fields";

const col = (format: string, description = "") => ({ format, description });
const fk = (table: string) => col("bigint", `<fk table='${table}' column='id'/>`);

const SCHEMA = schemaOf({
  survey_submission: {
    properties: {
      id: col("bigint", "<pk/>"),
      user_id: fk("app_user"),
      survey_id: fk("survey"),
      status: col("text"),
      created_date_time: col("timestamp with time zone"),
    },
  },
  scoring_result: {
    properties: { id: col("bigint", "<pk/>"), survey_submission_id: fk("survey_submission") },
  },
  personal_report: {
    properties: { id: col("bigint", "<pk/>"), survey_submission_id: fk("survey_submission") },
  },
  admin_note: {
    properties: { id: col("bigint", "<pk/>"), submission_id: fk("survey_submission") },
  },
  app_user: { properties: { id: col("bigint", "<pk/>") } },
  payment: {
    properties: {
      id: col("bigint", "<pk/>"),
      amount: col("numeric"),
      created_date_time: col("timestamp with time zone"),
    },
  },
  report_section_feedback: {
    properties: {
      id: col("bigint", "<pk/>"),
      comment: col("text"),
      created_at: col("timestamp with time zone"),
    },
  },
  marketing_spend: { properties: { id: col("bigint", "<pk/>") } },
  analytics_event: { properties: { id: col("bigint", "<pk/>") } },
  booking_event: { properties: { id: col("bigint", "<pk/>") } },
  admin_submission_facts: {
    properties: {
      submission_id: col("bigint"),
      status: col("text"),
      duration_ms: col("bigint"),
      created_date_time: col("timestamp with time zone"),
      archetype: col("text"),
      country: col("text"),
      utm_source: col("text"),
      has_report: col("boolean"),
      has_payment: col("boolean"),
      gender: col("text"),
      was_resumed: col("boolean"),
    },
  },
});
const TABLES = buildCatalog(SCHEMA, []);
const prod = (name: string) => TABLES.find((t) => t.source === "production" && t.name === name)!;
const outside = (name: string) => TABLES.find((t) => t.source !== "production" && t.name === name)!;

describe("the catalog's tables, as decided", () => {
  it("lists the design's six first, then by group (the product, tracking, admin last), A to Z", () => {
    expect(TABLES.filter((t) => t.source === "production").map((t) => t.name)).toEqual([
      "survey_submission",
      "payment",
      "report_section_feedback",
      "scoring_result",
      "personal_report",
      "app_user",
      "booking_event",
      "analytics_event",
      "marketing_spend",
      "admin_note",
      "admin_submission_facts",
    ]);
  });

  it("joins both ways, as the design's survey_submission does, without the admin tools", () => {
    // Its own links first (field order), then the tables pointing to it (A to Z).
    expect(prod("survey_submission").joins).toEqual([
      "app_user",
      "survey",
      "personal_report",
      "scoring_result",
    ]);
    expect(prod("app_user").joins).toEqual(["survey_submission"]);
    // An admin table keeps its own links.
    expect(prod("admin_note").joins).toEqual(["survey_submission"]);
  });

  it("says how each table is fed", () => {
    expect(prod("survey_submission").feed).toBe("live");
    expect(prod("payment").feed).toBe("live · Stripe webhooks");
    expect(prod("admin_submission_facts").feed).toBe("rebuilt every 5 minutes");
    expect(prod("marketing_spend").feed).toBe("not in use");
    expect(prod("booking_event").feed).toBe("not in use");
    expect(outside("events").feed).toBe("live");
    expect(outside("sessions_daily").feed).toBe("every 15 minutes");
    expect(outside("campaign_daily").feed).toBe("every 15 minutes");
    expect(outside("site_daily").feed).toBe("read live");
    expect(outside("search_console_daily").feed).toBe("read live, 2–3 days behind");
  });

  it("tags the feedback comment Partly PII without changing what the explorer allows", () => {
    const comment = prod("report_section_feedback").fields.find((f) => f.name === "comment")!;
    expect(comment).toMatchObject({ freeText: true, privacy: null });
    // Still filterable while masked, matched whole, as before.
    expect(() =>
      checkQuery(
        prod("report_section_feedback"),
        {
          dateField: "created_at",
          from: "2026-09-21",
          to: "2026-10-20",
          filters: [{ column: "comment", op: "eq", value: "great" }],
          columns: ["id", "comment"],
          sort: null,
          dir: "desc",
          page: 1,
          size: 12,
          cursor: null,
        },
        true
      )
    ).not.toThrow();
  });

  it("describes the submission facts the explorer opens on, every field", () => {
    const facts = prod("admin_submission_facts");
    expect(facts.origin).toBe("draft");
    expect(facts.description).toMatch(/rebuilds every 5 minutes/);
    for (const f of facts.fields) expect(f.origin, f.name).toBe("draft");
    expect(facts.fields.find((f) => f.name === "was_resumed")?.description).toMatch(
      /Not a resumed survey/
    );
  });

  it("defines every info icon of both pages", () => {
    for (const k of ["data.key", "data.joins", "data.rows", "data.fresh", "data.showing"])
      expect(FIELDS[k], k).toBeDefined();
  });
});

const state = vi.hoisted(() => ({
  search: "",
  path: "/admin/ap/sources",
  rows: { rows: 475, newest: "2026-10-18T18:51:29Z" } as unknown,
  result: null as unknown,
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => state.path,
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string) => ({
    data:
      url === "/api/admin/ap/catalog"
        ? CATALOG
        : url === "/api/admin/ap/explorer"
          ? state.result
          : url === "/api/admin/ap/saved-filters"
            ? { saved: [] }
            : state.rows,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/status", () => ({
  useApStatus: () => ({ status: { posthog: { ok: true, lastEvent: null } }, error: null }),
  useApRole: () => ({ canEdit: true, isAdmin: true }),
}));

const CATALOG: CatalogPayload = {
  sources: [
    {
      key: "production",
      name: "Production",
      status: "Live",
      ok: true,
      description: "",
      fresh: "Real time",
      tables: 11,
    },
  ],
  tables: TABLES,
  generatedAt: "2026-10-21T10:00:00Z",
};

import ApExplorer from "@features/admin/ui/ap/ApExplorer";
import ApSources from "@features/admin/ui/ap/ApSources";

const DESIGN = [
  "submission_id",
  "created_date_time",
  "status",
  "duration_ms",
  "archetype",
  "country",
  "utm_source",
  "has_report",
  "has_payment",
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
  state.search = "";
  state.path = "/admin/ap/sources";
  state.rows = { rows: 475, newest: "2026-10-18T18:51:29Z" };
  state.result = {
    columns: DESIGN,
    rows: [
      {
        submission_id: 7341,
        created_date_time: "2026-10-12T08:53:00Z",
        status: "completed",
        duration_ms: 521_000,
        archetype: "Spark Seeker",
        country: "DE",
        utm_source: "google",
        has_report: true,
        has_payment: false,
      },
    ],
    total: 442,
    masked: true,
    sql: "SELECT 1",
  } satisfies ExplorerResult;
  router.replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const chip = (label: string) => screen.getByText(label, { selector: "strong" }).parentElement!;

describe("the catalog's facts", () => {
  it("reads Key, Joins, Rows and Fresh, in that order, each with its info icon", () => {
    state.search = "table=payment";
    render(<ApSources />);
    const facts = ["Key", "Rows", "Fresh"];
    for (const label of facts)
      expect(
        within(chip(label)).getByRole("button", { name: `About ${label}` }),
        label
      ).toBeInTheDocument();
    // How payment is fed, and its newest row in Berlin time, the year left out this year.
    expect(chip("Fresh").textContent).toBe(
      "Fresh live · Stripe webhooks · newest row 18 Oct, 20:51"
    );
    expect(chip("Rows").textContent).toBe("Rows 475");
    const order = Array.from(chip("Key").parentElement!.querySelectorAll("strong")).map(
      (s) => s.textContent
    );
    expect(order).toEqual(facts);
  });

  it("joins both ways on the page too, and keeps the year of an older row", () => {
    state.rows = { rows: 3, newest: "2025-12-01T09:00:00Z" };
    render(<ApSources />);
    expect(chip("Joins").textContent).toBe(
      "Joins app_user, survey, personal_report, scoring_result"
    );
    expect(within(chip("Joins")).getByRole("button", { name: "About Joins" })).toBeInTheDocument();
    expect(chip("Fresh").textContent).toBe("Fresh live · newest row 1 Dec 2025, 10:00");
  });

  it("says when a table has no rows", () => {
    state.search = "table=booking_event";
    state.rows = { rows: 0, newest: null };
    render(<ApSources />);
    expect(chip("Fresh").textContent).toBe("Fresh not in use · no rows");
  });

  it("tags free text Partly PII, and counts it as personal", () => {
    state.search = "table=report_section_feedback";
    render(<ApSources />);
    const tag = screen.getByText("Partly PII");
    expect(tag.getAttribute("title")).toMatch(/Free text/);
    fireEvent.click(screen.getByRole("button", { name: "Personal fields only" }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("[role=cell]")?.firstChild?.textContent)).toEqual([
      "comment",
    ]);
  });
});

describe("the explorer, as decided", () => {
  beforeEach(() => {
    state.path = "/admin/ap/explorer";
  });

  const lastCols = () =>
    new URL(String(router.replace.mock.calls.at(-1)![0]), "http://x").searchParams.get("cols");

  it("lists the submission facts first, then the catalog's order", () => {
    render(<ApExplorer />);
    const options = within(screen.getByRole("combobox", { name: "Table" }))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual([
      "admin_submission_facts",
      "survey_submission",
      "payment",
      "report_section_feedback",
      "scoring_result",
      "personal_report",
      "app_user",
      "booking_event",
      "analytics_event",
      "marketing_spend",
      "admin_note",
    ]);
  });

  it("adds a ticked column at the end, keeping the order chosen", () => {
    state.search = `cols=${["status", "submission_id", "archetype"].join(",")}`;
    render(<ApExplorer />);
    fireEvent.click(screen.getByRole("checkbox", { name: "country" }));
    expect(lastCols()).toBe("status,submission_id,archetype,country");
    fireEvent.click(screen.getByRole("checkbox", { name: "submission_id" }));
    expect(lastCols()).toBe("status,archetype");
    cleanup();
    // From the design's nine.
    state.search = "";
    render(<ApExplorer />);
    fireEvent.click(screen.getByRole("checkbox", { name: "gender" }));
    expect(lastCols()).toBe([...DESIGN, "gender"].join(","));
  });

  it("saves a view with the filter bar's form: a name, Share with team, Save and Cancel", () => {
    render(<ApExplorer />);
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    expect(screen.getByRole("textbox", { name: "Name this view" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Share with team" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Name this view" })).toBeNull();
  });

  it("puts an info icon on the results summary", () => {
    render(<ApExplorer />);
    const about = screen.getByRole("button", { name: "About Showing … of N rows" });
    expect(about.parentElement!.textContent).toMatch(/of 442 rows · masked/);
  });
});
