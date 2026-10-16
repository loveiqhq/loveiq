// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCatalog, schemaOf, type CatalogPayload } from "@features/admin/server/ap/catalog";
import type { ExplorerResult } from "@features/admin/server/ap/explorer-spec";

const col = (format: string, description = "") => ({ format, description });
const fk = (table: string) => col("bigint", `<fk table='${table}' column='id'/>`);

const CATALOG: CatalogPayload = {
  sources: [
    {
      key: "production",
      name: "Production",
      status: "Live",
      ok: true,
      description: "",
      fresh: "",
      tables: 4,
    },
    {
      key: "ads",
      name: "Google Ads",
      status: "No data",
      ok: false,
      description: "",
      fresh: "",
      tables: 1,
    },
  ],
  tables: buildCatalog(
    schemaOf({
      survey_submission: {
        properties: {
          id: col("bigint", "<pk/>"),
          user_id: fk("app_user"),
          survey_id: fk("survey"),
          status: col("text"),
          duration_ms: col("bigint"),
          created_date_time: col("timestamp with time zone"),
        },
      },
      funnel_event: {
        properties: {
          visitor_id: col("text", "<pk/>"),
          day: col("date", "<pk/>"),
          event_type: col("text", "<pk/>"),
        },
      },
      admin_audit_log: {
        properties: { id: col("bigint", "<pk/>"), created_at: col("timestamp with time zone") },
      },
      admin_submission_facts: {
        properties: {
          submission_id: col("bigint"),
          session_id: col("text"),
          email: col("text"),
          status: col("text"),
          duration_ms: col("bigint"),
          created_date_time: col("timestamp with time zone"),
          archetype: col("text"),
          gender: col("text"),
          country: col("text"),
          utm_source: col("text"),
          has_report: col("boolean"),
          has_payment: col("boolean"),
          was_resumed: col("boolean"),
        },
      },
    }),
    []
  ),
  generatedAt: "2026-10-14T10:00:00Z",
};

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

const state = vi.hoisted(() => ({
  search: "",
  path: "/admin/ap/explorer",
  role: "admin" as string | null,
  result: null as unknown,
  explorerParams: [] as Array<Record<string, string> | undefined>,
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => state.path,
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string, params?: Record<string, string>) => {
    if (url === "/api/admin/ap/explorer") state.explorerParams.push(params);
    const data =
      url === "/api/admin/ap/catalog"
        ? CATALOG
        : url === "/api/admin/ap/explorer"
          ? state.result
          : url === "/api/admin/ap/saved-filters"
            ? SAVED
            : ROWS;
    return { data, loading: false, error: null, refetch: () => {} };
  },
}));
vi.mock("@features/admin/ui/ap/status", () => ({
  useApStatus: () => ({ status: state.role ? STATUS : null, error: null }),
  useApRole: () => ({
    canEdit: state.role === "admin" || state.role === "editor",
    isAdmin: state.role === "admin",
  }),
}));
const SAVED = { saved: [] };
const ROWS = { rows: 3, newest: null };
const STATUS = {
  email: "mb@loveiq.org",
  role: "admin",
  production: { ok: true },
  ga4: { lastDay: null },
  posthog: { ok: true, lastEvent: null },
};

import ApExplorer from "@features/admin/ui/ap/ApExplorer";
import ApSources from "@features/admin/ui/ap/ApSources";

const result = (over: Partial<ExplorerResult> = {}): ExplorerResult => ({
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
  total: 1,
  masked: true,
  sql: "SELECT 1",
  ...over,
});

beforeEach(() => {
  state.search = "";
  state.path = "/admin/ap/explorer";
  state.role = "admin";
  state.result = result();
  state.explorerParams = [];
  router.push.mockReset();
  router.replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the raw data explorer as drawn", () => {
  it("opens the submission facts on the design's nine columns, funnels on six, times as 8m 41s", () => {
    render(<ApExplorer />);
    expect(state.explorerParams.at(-1)).toMatchObject({
      table: "admin_submission_facts",
      cols: DESIGN.join(","),
    });
    const head = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(head).toEqual(DESIGN);
    const funnels = screen
      .getAllByRole("button", { name: /^Filter / })
      .map((b) => b.getAttribute("aria-label"));
    expect(funnels).toEqual(
      ["status", "archetype", "country", "utm_source", "has_report", "has_payment"].map(
        (c) => `Filter ${c}`
      )
    );
    // Every column still sorts.
    expect(screen.getAllByRole("button", { name: /^Sort by / })).toHaveLength(9);
    const cell = screen.getByText("8m 41s");
    expect(cell.getAttribute("title")).toBe("521000");
    // The id stays left, as the design's does; the time sits right.
    expect(screen.getByText("7341").className).not.toContain("text-right");
    expect(cell.className).toContain("text-right");
  });

  it("fits the nine columns at 1440px: a tight header puts its buttons under its name", () => {
    render(<ApExplorer />);
    // Kept to one line, the nine columns needed about 1,115px of the 1,068 there are at 1440px.
    const heads = screen.getAllByRole("columnheader");
    expect(heads).toHaveLength(9);
    for (const h of heads) expect(h).not.toHaveClass("whitespace-nowrap");
    // More columns still scroll sideways.
    expect(screen.getByRole("table").parentElement).toHaveClass("overflow-x-auto");
  });

  it("ends the quick ranges yesterday, This month too; on the 1st, this month is today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const pick = (now: string, label: string) => {
        vi.setSystemTime(new Date(now));
        render(<ApExplorer />);
        fireEvent.click(screen.getByRole("button", { name: label }));
        cleanup();
        const url = new URL(String(router.replace.mock.calls.at(-1)![0]), "http://x");
        return [url.searchParams.get("from"), url.searchParams.get("to")];
      };
      // 14 Oct in Berlin.
      expect(pick("2026-10-14T10:00:00Z", "This month")).toEqual(["2026-10-01", "2026-10-13"]);
      expect(pick("2026-10-14T10:00:00Z", "7 days")).toEqual(["2026-10-07", "2026-10-13"]);
      // 1 Nov: no whole day of November yet.
      expect(pick("2026-11-01T10:00:00Z", "This month")).toEqual(["2026-11-01", "2026-11-01"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says why a page is empty", () => {
    const empty = (search: string, over: Partial<ExplorerResult> = {}) => {
      state.search = search;
      state.result = result({ rows: [], total: 0, ...over });
      render(<ApExplorer />);
      const text = screen.getByRole("cell").textContent;
      cleanup();
      return text;
    };
    expect(empty("")).toBe("No rows in these dates.");
    expect(empty(`filters=${encodeURIComponent('[["status","eq","x"]]')}`)).toBe(
      "No rows for these filters in these dates."
    );
    expect(empty("date=")).toBe("This table has no rows.");
    expect(empty("page=3", { total: 24 })).toBe("No rows on this page: go back a page.");
    expect(
      empty("source=ads&table=campaign_daily", {
        columns: ["date"],
        synced: false,
        masked: false,
      })
    ).toBe("Not synced yet: Google Ads rows appear here after its first sync.");
  });
});

describe("Export CSV from the data sources page", () => {
  const download = () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-disposition": 'attachment; filename="facts.csv"' }),
      blob: async () => new Blob(["a\n"]),
    }));
    vi.stubGlobal("fetch", fetchMock);
    // jsdom has no blob links and does not navigate: the download stops at the click.
    for (const name of ["createObjectURL", "revokeObjectURL"])
      Object.defineProperty(URL, name, { value: () => "blob:x", configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    return fetchMock;
  };

  it("opens the table in the explorer and runs its own export there, once", async () => {
    state.path = "/admin/ap/sources";
    render(<ApSources />);
    expect(screen.queryByRole("button", { name: /Export field list/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(router.push).toHaveBeenCalledWith(
      "/admin/ap/explorer?source=production&table=survey_submission&export=1"
    );
    cleanup();

    const fetchMock = download();
    state.path = "/admin/ap/explorer";
    state.search = "source=production&table=survey_submission&export=1";
    const { rerender } = render(<ApExplorer />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), "http://x");
    expect(url.pathname).toBe("/api/admin/ap/explorer");
    expect(url.searchParams.get("format")).toBe("csv");
    expect(url.searchParams.get("table")).toBe("survey_submission");
    // Off the address, so a reload does not export again; and not twice on a re-render.
    expect(router.replace).toHaveBeenCalledWith(
      "/admin/ap/explorer?source=production&table=survey_submission",
      { scroll: false }
    );
    rerender(<ApExplorer />);
    await screen.findByText("Exported facts.csv. Exports are logged.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits for the role before it exports or refuses", async () => {
    const fetchMock = download();
    state.role = null;
    state.search = "source=production&table=survey_submission&export=1";
    const { rerender } = render(<ApExplorer />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    // No notice either way: not "admins only" while the role is still unknown.
    expect(screen.queryByRole("status")).toBeNull();
    state.role = "admin";
    rerender(<ApExplorer />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("is for admins: shown as such on both pages, and nothing is fetched", async () => {
    state.role = "editor";
    state.path = "/admin/ap/sources";
    render(<ApSources />);
    const button = screen.getByRole("button", { name: /Export CSV/ });
    expect(button).toBeDisabled();
    expect(button.textContent).toBe("Export CSV · Admins only");
    cleanup();

    const fetchMock = download();
    state.path = "/admin/ap/explorer";
    state.search = "source=production&table=survey_submission&export=1";
    render(<ApExplorer />);
    await screen.findByText("Export CSV: admins only.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the data sources page as drawn", () => {
  it("lists the joins a table's own fields make, and drops the chip when there are none", () => {
    state.path = "/admin/ap/sources";
    render(<ApSources />);
    expect(screen.getByText("Joins").parentElement!.textContent).toBe("Joins app_user, survey");

    cleanup();
    state.search = "table=funnel_event";
    render(<ApSources />);
    expect(screen.queryByText("Joins")).toBeNull();
    expect(screen.getByText("Key").parentElement!.textContent).toBe(
      "Key visitor_id + day + event_type"
    );
  });

  it("lists the design's tables first, and keeps a closed table's buttons off", () => {
    state.path = "/admin/ap/sources";
    render(<ApSources />);
    const tables = within(screen.getByRole("navigation", { name: "Tables" }))
      .getAllByRole("button")
      .map((b) => b.getAttribute("title"));
    expect(tables).toEqual([
      "survey_submission",
      "funnel_event",
      "admin_audit_log",
      "admin_submission_facts",
    ]);
    cleanup();
    state.search = "table=admin_audit_log";
    render(<ApSources />);
    expect(screen.queryByRole("link", { name: "Open raw data" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Export CSV/ })).toBeNull();
  });
});
