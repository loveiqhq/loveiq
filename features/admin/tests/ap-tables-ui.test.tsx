// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDashboard } from "@features/admin/server/ap/assessment";
import { parseFilters } from "@features/admin/server/ap/filters";
import type { QuoteFact } from "@features/admin/server/ap/facts";
import type { Tile } from "@features/admin/server/ap/overview";
import { buildReportPage, type ReportExtras } from "@features/admin/server/ap/report-page";

import { factsFixture } from "./ap-fixtures";

// The screens' own table controls and change colours, drawn from payloads the builders made.
const TODAY = "2026-10-13";
const now = new Date("2026-10-13T10:00:00Z");
const filters = parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY);

const screenData = vi.hoisted(() => ({ byUrl: {} as Record<string, unknown> }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string) => ({
    data: screenData.byUrl[url] ?? null,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", async () => {
  const { parseFilters: parse } = await import("@features/admin/server/ap/filters");
  return {
    useApFilters: () => ({
      filters: parse({}, "2026-10-13"),
      today: "2026-10-13",
      update: () => {},
      reset: () => {},
      apply: () => {},
      params: {},
      query: "",
    }),
  };
});
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import ApDashboard from "@features/admin/ui/ap/ApDashboard";
import ApReport from "@features/admin/ui/ap/ApReport";
import { KpiTile } from "@features/admin/ui/ap/kit";

afterEach(cleanup);

const ad = { byDay: new Map<string, number>(), from: "2026-04-24", to: TODAY };
const quote = (plan: string, price: number, sales: number): QuoteFact => ({
  plan,
  price,
  priceArm: "B",
  device: "iOS",
  tier: "tier_1",
  quoted: 10,
  checkouts: 3,
  sales,
  revenue: Math.round(price * sales * 100) / 100,
  src: "google",
  med: "cpc",
  ads: true,
  fb: false,
  ref: null,
});

describe("the dashboard's prices table", () => {
  it("narrows by plan and by price from the column funnels, and a second press clears it", () => {
    const facts = factsFixture({
      quotes: [quote("essentials", 4.99, 1), quote("full_report", 6.99, 2)],
    });
    screenData.byUrl = {
      "/api/admin/ap/assessment": buildDashboard({
        facts,
        previous: null,
        ad,
        filters,
        today: TODAY,
        now,
        newReturning: null,
      }),
    };
    render(<ApDashboard />);
    const table = screen.getByRole("table", { name: "Prices" });
    const rows = () => within(table).getAllByRole("row").length - 1;
    expect(rows()).toBe(2);

    fireEvent.click(within(table).getByRole("button", { name: "Filter Plan" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "full" } });
    expect(rows()).toBe(1);
    expect(within(table).getByText("6.99", { exact: false })).toBeTruthy();
    // Pressed again, the plan's funnel closes and lets every plan back in.
    fireEvent.click(within(table).getByRole("button", { name: "Filter Plan" }));
    expect(rows()).toBe(2);

    fireEvent.click(within(table).getByRole("button", { name: "Filter Price" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "4.99" } });
    expect(rows()).toBe(1);
    expect(within(table).queryByText("6.99", { exact: false })).toBeNull();
  });
});

describe("the report's email campaigns table", () => {
  it("narrows to the campaign picked in its funnel", () => {
    const extras: ReportExtras = {
      wizard: [],
      map_steppers: [],
      chapters: [],
      paywall_clicks: [],
      chapter_stats: [],
      chapter_readers: 0,
      chapter_stats_from: null,
      wizard_skips: [],
      wizard_skips_from: null,
      issues: [],
      feedback: [],
      votes_total: 0,
      emails: [
        { stage: "72h_no_unlock", sent: 40, bought: 2, revenue: 6.98, returned: 5 },
        { stage: "54h_no_unlock", sent: 12, bought: 0, revenue: 0, returned: 1 },
      ],
      email_events_from: null,
      email_opens_from: null,
    } as ReportExtras;
    const facts = factsFixture();
    screenData.byUrl = {
      "/api/admin/ap/report": buildReportPage({
        facts,
        previous: null,
        benchmark: facts,
        extras,
        returns: null,
        filters,
        today: TODAY,
        now,
      }),
    };
    render(<ApReport />);
    const table = screen.getByRole("table", { name: "Email campaigns" });
    const names = () =>
      within(table)
        .queryAllByRole("rowheader")
        .map((r) => r.textContent ?? "");
    expect(names()).toHaveLength(3);

    fireEvent.click(within(table).getByRole("button", { name: "Filter Campaign" }));
    const pick = screen.getByRole("combobox", { name: /filter campaign/i });
    const options = within(pick)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options[0]).toBe("All");
    fireEvent.change(pick, { target: { value: options.find((o) => o?.startsWith("54h")) } });
    expect(names()).toHaveLength(1);
    expect(names()[0]).toMatch(/^54h no unlock/);
    fireEvent.change(pick, { target: { value: "" } });
    expect(names()).toHaveLength(3);
  });
});

describe("a headline tile's change", () => {
  const tile = (over: Partial<Tile>): Tile => ({
    key: "k",
    label: "Label",
    unit: "pct",
    value: null,
    prev: null,
    goodWhen: "up",
    spark: [],
    foot: "",
    blocked: null,
    trend: "",
    ...over,
  });
  const change = (t: Tile) => {
    const { container } = render(<KpiTile tile={t} />);
    // The change: the bold, unbroken figure beside the value.
    const el = [...container.querySelectorAll("span")].find((s) =>
      /whitespace-nowrap.*font-bold/.test(s.className)
    );
    cleanup();
    return { text: el?.textContent, tone: el?.className.match(/text-ap-(good|bad|muted)/)?.[1] };
  };

  it("reads grey where neither way is better, and as a plain difference where asked", () => {
    // The report open rate: a check, neither good nor bad when it moves.
    expect(change(tile({ value: 0.94, prev: 0.96, goodWhen: "either" }))).toEqual({
      text: "−2.00 pt",
      tone: "muted",
    });
    expect(change(tile({ value: 0.94, prev: 0.96 }))).toMatchObject({ tone: "bad" });
    // A count of sales: "−3", not a percentage of the earlier one.
    expect(change(tile({ unit: "count", value: 7, prev: 10, deltaAs: "abs" }))).toEqual({
      text: "−3",
      tone: "bad",
    });
    expect(change(tile({ unit: "count", value: 7, prev: 10 })).text).toMatch(/%$/);
  });
});
