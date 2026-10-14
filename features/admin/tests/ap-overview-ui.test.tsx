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
const screenData = vi.hoisted(() => ({
  overview: null as unknown,
  dashboard: null as unknown,
  status: null as unknown,
}));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string) => ({
    data:
      url === "/api/admin/ap/overview"
        ? screenData.overview
        : url === "/api/admin/ap/assessment"
          ? screenData.dashboard
          : url === "/api/admin/ap/status"
            ? screenData.status
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
    // The design's widths, below which each table scrolls; wider where the headings need it
    // in two lines (Submissions, Engagement).
    expect(screen.getAllByRole("table", { name: "Source" }).map((t) => t.style.minWidth)).toEqual([
      "460px",
      "612px",
      "595px",
    ]);
    const google = within(screen.getAllByRole("table", { name: "Source" })[0]!)
      .getAllByRole("row")
      .find((r) => r.textContent?.startsWith("Google Ads"))!;
    // 30% of 220 live visits, in tenths; 10 starts of 66, in hundredths, as drawn.
    expect(
      within(google)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["66", "30.0%", "15.15%"]);
  });

  it("a heading's last word and its buttons never part; the splits have 14px sides", () => {
    screenData.overview = buildOverview({ facts, previous, ad, filters, today: TODAY, now });
    render(<ApOverview />);
    const subs = screen.getAllByRole("table", { name: "Assessment" })[1]!;
    const heads = within(subs).getAllByRole("columnheader");
    expect(heads.map((h) => h.textContent)).toEqual([
      "Assessment",
      "Starts",
      "Submissions",
      "Completion",
      "Submission CVR",
    ]);
    for (const h of heads) {
      const tail = h.querySelector(".whitespace-nowrap")!;
      // Every button of the heading sits in its last, unbroken part, with the last word.
      expect(
        within(h)
          .getAllByRole("button")
          .every((b) => tail.contains(b))
      ).toBe(true);
      expect(tail.textContent).toBe(h.textContent!.split(" ").at(-1));
    }
    // Wide enough for SUBMISSIONS and its button on one line, not the design's 516px.
    expect(subs.style.minWidth).toBe("612px");
    // Beside the funnel, the table's share is at least that wide, so it never scrolls there.
    const basis = (t: HTMLElement) =>
      Number(t.closest("[class*='flex-[1_1_']")!.className.match(/flex-\[1_1_(\d+)px\]/)![1]);
    expect(basis(subs)).toBeGreaterThanOrEqual(parseInt(subs.style.minWidth));
    const split = within(screen.getByRole("group", { name: "Split traffic by" }));
    expect(split.getByRole("button", { name: "Per source" }).className).toContain("px-3.5");
    fireEvent.click(split.getByRole("button", { name: "Per source" }));
    const bySource = screen.getAllByRole("table", { name: "Source" })[1]!;
    expect(basis(bySource)).toBeGreaterThanOrEqual(parseInt(bySource.style.minWidth));
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
    // Three boxes a row at every width, as drawn, their lines on shared rows, so a label in two
    // lines ("Per submission" on a phone) keeps the values level.
    expect(box("Costs & CAC", 0).parentElement!.className).toContain("grid-cols-3");
    for (const section of ["Revenue", "Costs & CAC"]) {
      for (const i of [0, 1, 2]) {
        expect(box(section, i).className).toMatch(/\brow-span-4\b.*\bgrid-rows-subgrid\b/);
        // The value is sized by its box, so "€3,986" fits three across a phone.
        expect(box(section, i).className).toContain("[container-type:inline-size]");
        expect(box(section, i).children[1]!.className).toContain("text-[length:min(24px,23cqi)]");
      }
    }
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
    const d = dashboard();
    // A rate over 10% keeps its hundredths, as the design's bars and the Sources table do.
    screenData.dashboard = {
      ...d,
      performance: d.performance.map((r) =>
        r.label === "Google Ads" ? { ...r, surveyCvr: 10 / 66 } : r
      ),
    };
    render(<ApDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "Performance" }));
    const traffic = within(screen.getByRole("region", { name: "Traffic" }));
    expect(traffic.getByText("15.15%")).toBeTruthy();
    expect(traffic.getByText("Survey complete CVR")).toBeTruthy();
    expect(traffic.getByText("€ revenue per visit")).toBeTruthy();
    expect(traffic.queryByText(/Payment CVR/)).toBeNull();
    expect(traffic.getByText("Sample split · totals are live")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New & return" }));
    // €6.99 paid by a new visitor's person, over 100 new visitors; none by returning ones.
    // The CVR in tenths, as the design's cards write it ("Survey CVR 3.6%").
    expect(screen.getByText(/Survey CVR 5\.0% · € \/ visit €0\.070/)).toBeTruthy();
    expect(screen.getByText(/Survey CVR 4\.0% · € \/ visit €0\.000/)).toBeTruthy();
    expect(screen.queryByText("Sample split · totals are live")).toBeNull();
  });

  it("tiles keep their values level, the journey is worded as drawn, the tabs have 16px sides", () => {
    screenData.dashboard = dashboard();
    render(<ApDashboard />);
    const dash = within(screen.getByRole("region", { name: "Dashboard" }));
    // Every tile on the grid's shared rows: a label in two lines moves the whole row's values.
    for (const label of ["Visitors", "€ rev. per survey complete", "Report open rate"]) {
      expect(dash.getByText(label).parentElement!.className).toMatch(
        /\bgrid grid-rows-subgrid row-span-5\b/
      );
    }
    expect(dash.getByText("Each step links to its report · % = of previous step")).toBeTruthy();
    // 10 of the 14 starts finished.
    expect(dash.getByText("71.4% of starts")).toBeTruthy();
    const tabs = within(screen.getByRole("group", { name: "Traffic report" }));
    expect(tabs.getByRole("button", { name: "Sources" }).className).toContain("px-4");
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

describe("blanks on screen say why", () => {
  it("Overview: ad spend with no figure for the range says so on its tile and its boxes", () => {
    const later = { byDay: new Map([["2026-10-10", 30]]), from: "2026-10-10", to: TODAY };
    screenData.overview = buildOverview({ facts, previous, ad: later, filters, today: TODAY, now });
    render(<ApOverview />);
    const why = "No ad spend recorded for these days.";
    const tile = screen.getByText("Ad spend", { selector: "a span" }).parentElement!;
    expect(within(tile).getByText(why)).toBeTruthy();
    expect(within(tile).queryByText("Google Ads")).toBeNull();
    const costs = within(screen.getByRole("region", { name: "Costs & CAC" }));
    // One in each of the three boxes; the table's note says it too.
    expect(costs.getAllByText(why)).toHaveLength(3);
    expect(costs.getByText(/refreshed every 15 minutes\. No ad spend recorded/)).toBeTruthy();
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

  it("suggests a saved filter's name as the design does", async () => {
    const { default: FilterBar } = await vi.importActual<
      typeof import("@features/admin/ui/ap/ApFilterBar")
    >("@features/admin/ui/ap/ApFilterBar");
    const { ApStatusProvider } = await import("@features/admin/ui/ap/status");
    // An editor: the save button needs the role.
    screenData.status = { email: "e@x", role: "editor" };
    render(
      <ApStatusProvider>
        <FilterBar scope="overall" />
      </ApStatusProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Save current filter" }));
    expect(screen.getByRole("textbox", { name: "Name this filter" })).toHaveAttribute(
      "placeholder",
      "e.g. Paid search · mobile · 30 days"
    );
    screenData.status = null;
  });
});
