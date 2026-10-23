// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Table } from "@features/admin/server/ap/common";
import {
  measuresOf,
  type FunnelKey,
  type PtsFunnel,
  type PtsPayload,
  type PtsStep,
  type PtsView,
} from "@features/admin/server/ap/pay-to-start";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
const exported = vi.hoisted(() => ({ sections: [] as Array<{ name: string; table: Table }> }));
vi.mock("@features/admin/ui/ap/csv", () => ({
  exportTables: (_file: string, sections: Array<{ name: string; table: Table }>) => {
    exported.sections = sections;
  },
}));

import ApPayToStart from "@features/admin/ui/ap/ApPayToStart";

const funnel = (
  key: FunnelKey,
  label: string,
  live: boolean,
  spend: number | null,
  clicks: number | null,
  all: PtsView,
  ads: PtsView,
  steps: PtsStep[]
): PtsFunnel => ({
  key,
  label,
  live,
  spend,
  clicks,
  all: { ...all, m: measuresOf(spend, clicks, all) },
  ads: { ...ads, m: measuresOf(spend, clicks, ads) },
  steps,
});

const s = (label: string, n: number | null, pays = false): PtsStep => ({ label, n, pays });

const payload: PtsPayload = {
  range: { from: "2026-10-12", to: "2026-10-22" },
  funnels: [
    funnel(
      "after",
      "Pay after the report",
      true,
      900,
      1200,
      { visits: 6000, finished: 300, paid: 2, revenue: 59.98 },
      { visits: 1200, finished: 260, paid: 1, revenue: 29.99 },
      [
        s("Visits", 6000),
        s("Survey started", 500),
        s("Survey finished", 300),
        s("Report opened", 290),
        s("Checkout started", 10),
        s("Paid", 2, true),
      ]
    ),
    funnel(
      "full",
      "Pay to start · €29.99",
      true,
      450,
      600,
      { visits: 500, finished: 5, paid: 6, revenue: 179.94 },
      { visits: 600, finished: 5, paid: 6, revenue: 179.94 },
      [
        s("Visits", 500),
        s("Checkout started", 26),
        s("Paid €29.99", 6, true),
        s("Survey finished", 5),
        s("Report opened", 5),
      ]
    ),
    funnel(
      "pre",
      "Pay to start · €1.99",
      true,
      450,
      640,
      { visits: 560, finished: 29, paid: 31, revenue: 121.66 },
      { visits: 640, finished: 28, paid: 30, revenue: 117.67 },
      [
        s("Visits", 560),
        s("Checkout started", 70),
        s("Paid €1.99", 31, true),
        s("Survey finished", 29),
        s("Report opened", 28),
        s("Bought the full report", 3, true),
      ]
    ),
    funnel(
      "gate",
      "€1.99 after the survey",
      false,
      0,
      0,
      { visits: 0, finished: 0, paid: 0, revenue: 0 },
      { visits: 0, finished: 0, paid: 0, revenue: 0 },
      [s("Visits", 0), s("Paid €1.99", 0, true)]
    ),
  ],
  weeks: [
    {
      from: "2026-10-12",
      to: "2026-10-18",
      label: "12 Oct",
      funnels: {
        after: { cac: 450, cvr: 0.0003, roas: 0.03 },
        full: { cac: null, cvr: null, roas: null },
        pre: { cac: 15, cvr: 0.05, roas: 0.27 },
        gate: { cac: null, cvr: null, roas: null },
      },
    },
    {
      from: "2026-10-19",
      to: "2026-10-22",
      label: "19 Oct",
      funnels: {
        after: { cac: null, cvr: 0, roas: 0 },
        full: { cac: 75, cvr: 0.012, roas: 0.4 },
        pre: { cac: 14, cvr: 0.055, roas: 0.3 },
        gate: { cac: null, cvr: null, roas: null },
      },
    },
  ],
  notes: ["No ad in this range lands on a pay-to-start page yet."],
};

afterEach(cleanup);

const table = () => screen.getByRole("table", { name: /Funnel metrics compared/ });
const row = (label: string) =>
  within(table())
    .getAllByRole("row")
    .find((r) => within(r).queryByRole("rowheader")?.textContent?.startsWith(label))!;
const cells = (label: string) =>
  within(row(label))
    .getAllByRole("cell")
    .map((c) => c.textContent);

describe("ApPayToStart", () => {
  it("lays the four funnels side by side, the gate off, the three core KPIs marked", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    const head = within(table())
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(head).toEqual([
      "Measure",
      "Pay after the reportLive",
      "Pay to start · €29.99Live",
      "Pay to start · €1.99Live",
      "€1.99 after the surveyOff",
    ]);
    expect(cells("Ad spend")).toEqual(["€900", "€450", "€450", "—"]);
    expect(cells("Visit → paying customer")).toEqual(["0.03%", "1.20%", "5.54%", "—"]);
    expect(cells("Revenue per visit")).toEqual(["€0.010", "€0.360", "€0.217", "—"]);
    expect(cells("ROAS")).toEqual(["0.07×", "0.40×", "0.27×", "—"]);
    expect(cells("Return on ad spend (€)")).toEqual(["−€840.02", "−€270.06", "−€328.34", "—"]);
    const core = within(table())
      .getAllByText("Core")
      .map((c) => c.closest("tr")!.querySelector("th")!.textContent);
    expect(core).toEqual(["Visit → paying customerCore", "Revenue per visitCore", "ROASCore"]);
  });

  it("marks the best of the running funnels green and the worst red, lower cost the better", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    const tone = (label: string) =>
      within(row(label))
        .getAllByRole("cell")
        .map((c) =>
          c.className.includes("text-ap-good-ink")
            ? "good"
            : c.className.includes("text-ap-bad-ink")
              ? "bad"
              : "plain"
        );
    expect(tone("Visit → paying customer")).toEqual(["bad", "plain", "good", "plain"]);
    expect(tone("Cost per paying customer")).toEqual(["bad", "plain", "good", "plain"]);
    // A count is no better for being bigger: never coloured.
    expect(tone("Paying customers")).toEqual(["plain", "plain", "plain", "plain"]);
  });

  it("switches the table to paid traffic only: ad clicks as visits, spend unchanged", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    expect(screen.queryByText(/Paid traffic only: visits are the ad clicks/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Paid traffic only" }));
    expect(cells("Visits")).toEqual(["1,200", "600", "640", "—"]);
    expect(cells("Paying customers")).toEqual(["1", "6", "30", "—"]);
    expect(cells("Ad spend")).toEqual(["€900", "€450", "€450", "—"]);
    expect(screen.getByText(/Paid traffic only: visits are the ad clicks/)).toBeTruthy();
  });

  it("walks each funnel step by step, every step a share of its own visits", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    const card = screen.getByRole("region", { name: "Pay to start · €1.99" });
    const items = within(card)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual([
      "Visits560 100.0%",
      "Checkout started70 12.5%",
      "Paid €1.9931 5.5%",
      "Survey finished29 5.2%",
      "Report opened28 5.0%",
      "Bought the full report3 0.54%",
    ]);
    expect(within(card).getByText("€121.66")).toBeTruthy();
    expect(within(card).getByText("€0.217")).toBeTruthy();
    const off = screen.getByRole("region", { name: "€1.99 after the survey" });
    expect(off.className).toContain("border-dashed");
    expect(within(off).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("draws a line per funnel by week, the gate's legend saying it is off", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    expect(screen.getByText("€1.99 after the survey · off")).toBeTruthy();
    const weeks = screen.getByRole("table", { name: /per week, per funnel/ });
    expect(within(weeks).getAllByRole("row")[1]!.textContent).toBe(
      "12 Oct – 18 Oct 2026€450—€15off"
    );
    fireEvent.click(screen.getByRole("button", { name: "ROAS" }));
    expect(within(weeks).getAllByRole("row")[2]!.textContent).toBe(
      "19 Oct – 22 Oct 20260.00×0.40×0.30×off"
    );
    expect(screen.getByRole("group", { name: /ROAS per week, per funnel/ })).toBeTruthy();
  });

  it("exports both traffic views, the steps and the weeks as plain figures", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(exported.sections.map((x) => x.name)).toEqual([
      "Funnel metrics, paid + organic",
      "Funnel metrics, paid traffic only",
      "Step by step",
      "Week by week (ads and organic)",
    ]);
    const all = exported.sections[0]!.table;
    const cvr = all.rows.find((r) => r.label === "Conversion: Visit → paying customer (%)")!;
    expect(cvr.values).toEqual(["0.03", "1.2", "5.54", ""]);
    const paid = exported.sections[1]!.table.rows.find((r) => r.label === "Conversion: Visits")!;
    expect(paid.values).toEqual(["1200", "600", "640", ""]);
    // The gate is off: no steps of its own.
    expect(
      exported.sections[2]!.table.rows.every((r) => r.label !== "€1.99 after the survey")
    ).toBe(true);
  });

  it("shows the notes under the page", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    expect(screen.getByText("No ad in this range lands on a pay-to-start page yet.")).toBeTruthy();
  });
});
