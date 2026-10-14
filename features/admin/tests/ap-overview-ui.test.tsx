// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDashboard } from "@features/admin/server/ap/assessment";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildOverview } from "@features/admin/server/ap/overview";
import type { SessionTags } from "@features/admin/server/ap/posthog";

import { factsFixture, sub } from "./ap-fixtures";

const TODAY = "2026-10-13";
const now = new Date("2026-10-13T10:00:00Z");
const filters = parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY);

// The screens draw payloads the builders made, without the network or the URL.
const screenData = vi.hoisted(() => ({ overview: null as unknown, dashboard: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string) => ({
    data:
      url === "/api/admin/ap/overview"
        ? screenData.overview
        : url === "/api/admin/ap/assessment"
          ? screenData.dashboard
          : null,
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
import ApOverview from "@features/admin/ui/ap/ApOverview";

afterEach(cleanup);

const tags = (src: string | null, med: string | null, sessions: number, ads = false) =>
  ({ src, med, ads, fb: false, ref: null, sessions }) satisfies SessionTags;
const sessions = {
  ok: true as const,
  value: [tags("google", "cpc", 30, true), tags(null, null, 70)],
};
const ad = {
  byDay: new Map([
    ["2026-09-25", 100.5],
    ["2026-10-02", 40],
    ["2026-10-03", 60],
  ]),
  from: "2026-04-24",
  to: TODAY,
};
const facts = factsFixture();
// The week before: 1,000 visits, one finisher, two sales of €12.50, €100.50 of ad spend.
const previous = factsFixture({
  from: "2026-09-24",
  to: "2026-09-30",
  visits: [{ day: "2026-09-25", arm: "white_card", src: null, n: 1000 }],
  subs: [sub({ id: 31, day: "2026-09-25", at: "2026-09-25T10:00:00Z" })],
  money: [
    { ...facts.money[0]!, sid: 31, day: "2026-09-25", amount: 12.5 },
    { ...facts.money[0]!, sid: 32, day: "2026-09-26", amount: 12.5 },
  ],
});

const pressed = (group: string) =>
  within(screen.getByRole("group", { name: group }))
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent);

describe("the Overview as drawn", () => {
  it("one split for Traffic, Submissions and Engagement, the estimate marked Sample split", () => {
    screenData.overview = buildOverview({
      facts,
      previous,
      ad,
      filters,
      today: TODAY,
      now,
      sessions,
    });
    render(<ApOverview />);
    const groups = ["Split traffic by", "Split submissions by", "Split engagement by"];
    for (const g of groups) expect(pressed(g)).toEqual(["Per assessment"]);
    // The per-assessment traffic share in whole percent, as drawn.
    const traffic = screen.getAllByRole("table", { name: "Assessment" })[0]!;
    expect(within(traffic).getAllByRole("row")[1]?.textContent).toContain("100%");
    expect(screen.queryByText("Sample split · totals are live")).toBeNull();

    fireEvent.click(
      within(screen.getByRole("group", { name: "Split submissions by" })).getByRole("button", {
        name: "Per source",
      })
    );
    for (const g of groups) expect(pressed(g)).toEqual(["Per source"]);
    // Over Traffic and Submissions, whose visitors are estimated; Engagement has no estimate.
    expect(screen.getAllByText("Sample split · totals are live")).toHaveLength(2);
    // The design's widths, below which each table scrolls (Submissions fitted to its column).
    expect(screen.getAllByRole("table", { name: "Source" }).map((t) => t.style.minWidth)).toEqual([
      "460px",
      "516px",
      "560px",
    ]);
    const google = within(screen.getAllByRole("table", { name: "Source" })[0]!)
      .getAllByRole("row")
      .find((r) => r.textContent?.startsWith("Google Ads"))!;
    // 30% of 220 live visits; 10 starts of 66.
    expect(
      within(google)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["66", "30%", "15.2%"]);
  });

  it("the funnel's last step is Paid, its shares a tenth of a percent", () => {
    screenData.overview = buildOverview({ facts, previous, ad, filters, today: TODAY, now });
    render(<ApOverview />);
    const funnel = screen.getByText(/^Funnel · share of/).parentElement!;
    expect(within(funnel).getByText("Paid")).toBeTruthy();
    expect(within(funnel).queryByText("Paid (so far)")).toBeNull();
    // 14 starts of 220 visits.
    expect(within(funnel).getByText("Started survey").nextSibling?.textContent).toBe(
      "14 · 6.4% · 6.4% of previous"
    );
  });

  it("the Revenue and Costs boxes write their lines as the design does", () => {
    screenData.overview = buildOverview({ facts, previous, ad, filters, today: TODAY, now });
    render(<ApOverview />);
    // A box's lines: its label, its value, then the line under it.
    const box = (section: string, i: number) =>
      screen.getByRole("region", { name: section }).querySelector(".grid-cols-3")!.children[i]!;
    const line = (section: string, i: number) => box(section, i).children[2]!;
    // €6.99 against €25: its change alone, red.
    expect(line("Revenue", 0).textContent).toBe("−72.0%");
    expect(line("Revenue", 0).className).toContain("text-ap-bad");
    // One paying customer against two: the plain difference.
    expect(line("Revenue", 1).textContent).toBe("−1");
    // €0.032 against €0.025: the previous value in grey.
    expect(line("Revenue", 2).textContent).toBe("prev. €0.025");
    expect(line("Revenue", 2).className).not.toContain("font-bold");
    // €100 against €100.50: under 1%.
    expect(line("Costs & CAC", 0).textContent).toBe("flat vs prev.");
    // €50 per submission against €100.50 (lower is good); CAC €100 against €50.25.
    expect(line("Costs & CAC", 1).textContent).toBe("prev. €100.50");
    expect(line("Costs & CAC", 1).className).toContain("text-ap-good");
    expect(line("Costs & CAC", 2).textContent).toBe("prev. €50.25");
    expect(line("Costs & CAC", 2).className).toContain("text-ap-bad");
    // Three boxes a row at every width, as drawn.
    expect(box("Costs & CAC", 0).parentElement!.className).toContain("grid-cols-3");
    // The costs table's money with cents.
    const costs = screen.getAllByRole("table", { name: "Assessment" }).at(-1)!;
    expect(
      within(within(costs).getAllByRole("row")[1]!)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["€100.00", "€50.00", "€100.00"]);
  });
});

describe("the Assessment A dashboard as drawn", () => {
  const A = "0192f0aa-1111-7000-8000-000000000001";
  const withVisits = factsFixture({
    money: [{ ...facts.money[0]!, ph: A }],
    quotes: [
      {
        src: "google",
        med: "cpc",
        ads: true,
        plan: "full_report",
        priceArm: "A3",
        price: 6.99,
        device: "iOS",
        tier: "tier_1",
        quoted: 4,
        checkouts: 1,
        sales: 1,
        revenue: 6.99,
      },
    ],
  });
  const dashboard = () =>
    buildDashboard({
      facts: withVisits,
      previous: null,
      ad,
      filters,
      today: TODAY,
      now,
      newReturning: {
        ok: true,
        value: {
          new: { visitors: 100, started: 10, completed: 5 },
          returning: { visitors: 50, started: 5, completed: 2 },
        },
      },
      sessions,
      visitorGroups: { ok: true, value: new Map([[A, "new"]]) },
    });

  it("Sources: the source filters but does not sort, under the Sample split mark", () => {
    screenData.dashboard = dashboard();
    render(<ApDashboard />);
    expect(screen.getByText("Sample split · totals are live")).toBeTruthy();
    const sources = screen.getByRole("table", { name: "Source" });
    expect(within(sources).getByRole("button", { name: "Filter Source" })).toBeTruthy();
    expect(within(sources).queryByRole("button", { name: "Sort by Source" })).toBeNull();
    expect(within(sources).getByRole("button", { name: "Sort by Visitors" })).toBeTruthy();
    expect(within(sources).getByText("Share of visits")).toBeTruthy();
  });

  it("Performance and New & returning: per visit, as drawn", () => {
    screenData.dashboard = dashboard();
    render(<ApDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "Performance" }));
    const traffic = within(screen.getByRole("region", { name: "Traffic" }));
    expect(traffic.getByText("Survey complete CVR")).toBeTruthy();
    expect(traffic.getByText("€ revenue per visit")).toBeTruthy();
    expect(traffic.queryByText(/Payment CVR/)).toBeNull();
    expect(traffic.getByText("Sample split · totals are live")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New & return" }));
    // €6.99 paid by a new visitor's person, over 100 new visitors; none by returning ones.
    expect(screen.getByText(/Survey CVR 5\.00% · € \/ visit €0\.070/)).toBeTruthy();
    expect(screen.getByText(/Survey CVR 4\.00% · € \/ visit €0\.000/)).toBeTruthy();
    expect(screen.queryByText("Sample split · totals are live")).toBeNull();
  });

  it("Prices: the design's description, plan names and whole price pills", () => {
    screenData.dashboard = dashboard();
    render(<ApDashboard />);
    expect(
      screen.getByText(
        "Sales per plan and price point for the selected period · comps (€0 unlocks) are not counted as sales"
      )
    ).toBeTruthy();
    const prices = screen.getByRole("table", { name: "Prices" });
    expect(within(prices).getByText("Full")).toBeTruthy();
    expect(within(prices).getByText("€6.99 · A3").className).toContain("whitespace-nowrap");
  });
});

describe("the filter bar as drawn", () => {
  it("starts open, folds its explanation away, and sums up the range with both years", async () => {
    const { default: FilterBar } = await vi.importActual<
      typeof import("@features/admin/ui/ap/ApFilterBar")
    >("@features/admin/ui/ap/ApFilterBar");
    render(<FilterBar scope="overall" />);
    expect(screen.getByRole("button", { name: "Hide filters" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    const how = screen.getByText("How these filters work").closest("details")!;
    expect(how.open).toBe(false);
    expect(within(how).getByText(/New or returning comes from PostHog/)).toBeTruthy();
    expect(screen.getByText("Showing").parentElement?.textContent).toBe(
      "Showing 13 Sep 2026 – 12 Oct 2026 · vs previous period · all assessments, sources and devices"
    );
    const assessment = screen.getByRole("combobox", { name: "Assessment" });
    expect(
      within(assessment)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toEqual(["All assessments", "Assessment A", "Assessment B", "Assessment C"]);
  });
});
