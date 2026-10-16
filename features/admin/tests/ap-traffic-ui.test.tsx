// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Table, Tile } from "@features/admin/server/ap/common";
import type {
  AudienceDim,
  BreakdownKey,
  PerfRow,
  PerfTable,
  TrafficPayload,
} from "@features/admin/server/ap/traffic";
import type { Counts } from "@features/admin/server/ap/traffic-math";

// ---------------------------------------------------------------------------------------------
// A small made-up payload: three channels, a blocked breakdown, no purchases from the campaigns.

const counts = (c: Partial<Counts> = {}): Counts => ({
  spend: null,
  clicks: null,
  impressions: null,
  visitors: null,
  starts: null,
  completes: 0,
  payers: 0,
  sales: 0,
  revenue: 0,
  fullPayers: 0,
  ...c,
});

const row = (key: string, name: string, c: Partial<Counts>, extra: Partial<PerfRow> = {}) =>
  ({
    key,
    name,
    sub: "",
    counts: counts(c),
    sampleVisitors: true,
    readMs: 180_000,
    people: c.completes ?? 0,
    lifetimeRevenue: c.revenue ?? 0,
    allSales: c.sales ?? 0,
    refunded: 0,
    ...extra,
  }) satisfies PerfRow;

const table = (
  key: BreakdownKey,
  label: string,
  rows: PerfRow[],
  extra: Partial<PerfTable> = {}
): PerfTable => ({ key, label, blocked: null, rows, total: null, notes: [], ...extra });

const NOW = counts({
  spend: 1000,
  clicks: 2000,
  impressions: 40_000,
  visitors: 10_000,
  starts: 900,
  completes: 400,
  payers: 4,
  sales: 4,
  revenue: 100,
  fullPayers: 3,
});
const CREATIVE_WHY = "Not tracked: the ad links don't carry the creative.";
const TABLET_WHY = "Tablets are told apart from 15 Oct 2026: pick a range from that day on.";

const channels = [
  row(
    "google_ads",
    "Google Ads",
    {
      spend: 1000,
      clicks: 2000,
      impressions: 40_000,
      visitors: 6000,
      starts: 600,
      completes: 300,
      payers: 3,
      sales: 3,
      revenue: 75,
      fullPayers: 2,
    },
    { sub: "Paid" }
  ),
  row(
    "direct",
    "Direct / unattributed",
    {
      spend: 0,
      visitors: 3000,
      starts: 200,
      completes: 80,
      payers: 1,
      sales: 1,
      revenue: 25,
      fullPayers: 1,
    },
    { sub: "Not tracked" }
  ),
  row("ai", "AI assistants", { spend: 0, visitors: 1000, starts: 100, completes: 20 }),
];

const keywordRows = [
  row(
    "camp|love test",
    "love test",
    {
      spend: 120,
      clicks: 300,
      impressions: 3000,
      visitors: 280,
      starts: 40,
      completes: 20,
    },
    { sub: "Search" }
  ),
  row(
    "camp|brand",
    "brand",
    { spend: 30, clicks: 50, impressions: 400, visitors: 45, starts: 10, completes: 8 },
    { sub: "Search" }
  ),
];

const dim = (key: string, title: string, kind: "visit" | "survey"): AudienceDim => ({
  key,
  title,
  kind,
  base: `${kind === "visit" ? "500 visits PostHog recorded" : "400 survey finishers"} · 1 – 30 Sep 2026`,
  values: [
    { label: `${title} one`, share: 0.6 },
    { label: `${title} two`, share: 0.4 },
  ],
  bySource: [
    { source: "Google Ads", shares: [0.8, 0.2], n: 300 },
    { source: "Meta Ads", shares: [null, null], n: 0 },
  ],
  perf: [
    {
      label: `${title} one`,
      share: 0.6,
      completeRate: 0.04,
      preRate: null,
      fullRate: 0.01,
      readMs: 200_000,
    },
    {
      label: `${title} two`,
      share: 0.4,
      completeRate: null,
      preRate: null,
      fullRate: null,
      readMs: null,
    },
  ],
  perfNote: `${title}: how the groups are counted.`,
  blocked: null,
});

const payload: TrafficPayload = {
  range: { from: "2026-09-01", to: "2026-09-30", label: "1 – 30 Sep 2026" },
  compare: { from: "2026-08-02", to: "2026-08-31", label: "2 – 31 Aug 2026" },
  generatedAt: "2026-10-01T08:00:00.000Z",
  notes: [],
  narrowed: null,
  launched: true,
  attribution: {
    visitorsWithSource: 0.42,
    unattributed: { n: 995, of: 3239 },
    purchasesWithSource: null,
    why: null,
  },
  tiles: {
    now: NOW,
    prev: counts({
      spend: 800,
      clicks: 1600,
      impressions: 30_000,
      visitors: 8000,
      completes: 300,
      payers: 2,
      sales: 2,
      revenue: 50,
      fullPayers: 2,
    }),
    points: [
      counts({ spend: 300, clicks: 600, visitors: 3000, completes: 100, revenue: 25, payers: 1 }),
      counts({ spend: 350, clicks: 700, visitors: 3500, completes: 150 }),
      counts({ spend: 350, clicks: 700, visitors: 3500, completes: 150, revenue: 75, payers: 3 }),
    ],
    blocked: { visitors: null, spend: null, people: null, starts: null },
  },
  trend: {
    grain: "week",
    points: [
      { label: "1 Sep", from: "2026-09-01", to: "2026-09-07", full: true },
      { label: "8 Sep", from: "2026-09-08", to: "2026-09-14", full: true },
      { label: "15 Sep", from: "2026-09-15", to: "2026-09-21", full: true },
    ],
    channels: [
      { key: "google_ads", name: "Google Ads", short: "Google Ads" },
      { key: "direct", name: "Direct / unattributed", short: "Direct" },
      { key: "meta_ads", name: "Meta Ads", short: "Meta Ads" },
      { key: "organic", name: "Organic search", short: "Organic" },
      { key: "owned", name: "Owned (email, referral)", short: "Owned" },
      { key: "other", name: "Other (AI, social)", short: "Other" },
    ],
    visitors: [
      [2000, 1800, 1500],
      [800, 600, 500],
      [0, 0, 0],
      [300, 200, 100],
      [0, 10, 5],
      [10, 60, 10],
    ],
    visitorsWhy: null,
    submissions: [
      [90, 110, 130],
      [8, 8, 8],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [1, 4, 4],
    ],
    costPerSub: [2.61, null, 2.13],
    note: "Organic search, Direct and Social sort differently before 15 Oct 2026.",
  },
  breakdowns: {
    channel: table("channel", "Channel", channels, {
      total: row("all", "All channels", NOW, { sampleVisitors: false, people: 398 }),
      notes: ["Meta Ads spend isn't read: only Google Ads spend is."],
    }),
    campaign: table("campaign", "Campaign", [
      row(
        "pmax",
        "Performance Max",
        { spend: 600, clicks: 1200, impressions: 20_000, visitors: 4000, completes: 260 },
        { sub: "Google Ads" }
      ),
      row(
        "search",
        "Search",
        { spend: 400, clicks: 800, impressions: 20_000, visitors: 2000, completes: 40 },
        { sub: "Google Ads" }
      ),
    ]),
    creative: table("creative", "Creative", [], { blocked: CREATIVE_WHY }),
    keyword: table("keyword", "Search term", keywordRows),
    audience: table("audience", "Audience", [], {
      blocked: "Not tracked: every campaign is prospecting.",
    }),
    landing: table("landing", "Landing page", [
      row(
        "white_card",
        "Question card",
        { visitors: 600, completes: 55 },
        { sampleVisitors: false }
      ),
      row(
        "white_video",
        "Presenter video",
        { visitors: 640, completes: 68 },
        { sampleVisitors: false }
      ),
    ]),
    assessment: table("assessment", "Assessment", [
      row("a", "Assessment A", NOW, { sub: "Live", sampleVisitors: false }),
      row("b", "Assessment B", {}, { sub: "Not live", sampleVisitors: false, muted: true }),
    ]),
    device: table("device", "Device", [
      row("phone", "Mobile", { visitors: 7000, completes: 350, payers: 2, sales: 2, revenue: 50 }),
      row("tablet", "Tablet", {}, { blocked: TABLET_WHY }),
    ]),
    tier: table("tier", "Country tier", [
      row("tier_1", "Tier 1", { visitors: 5000, completes: 250 }),
    ]),
    visitor: table("visitor", "Visitor type", [
      row("new", "New", { visitors: 9000, completes: 380 }),
      row("returning", "Returning", { visitors: 1000, completes: 20 }),
    ]),
  },
  intent: {
    creative: { blocked: CREATIVE_WHY },
    keyword: {
      rows: keywordRows.map((r) => ({ name: r.name, sub: r.sub, counts: r.counts })),
      why: null,
    },
  },
  cohorts: {
    rows: [
      {
        source: "Google Ads",
        users: 300,
        rev: [0.25, 0.3, null, null],
        eligible: [300, 200, 0, 0],
        growth: null,
        repeat: 0.01,
        crossSell: 0,
        refund: null,
      },
      {
        source: "AI assistants",
        users: 1,
        rev: [0, 0, null, null],
        eligible: [1, 1, 0, 0],
        growth: null,
        repeat: 0,
        crossSell: 0,
        refund: null,
      },
    ],
    why: null,
    note: "People whose first finished survey falls in the range.",
  },
  experiments: {
    arms: [
      {
        test: "Landing hero",
        note: "#6 · from 14 Oct 2026",
        arm: "Question card",
        control: true,
        visitors: 119,
        startCvr: 0.1,
        submissions: 4,
        paymentCvr: 0,
        revPerSub: 0,
        revPerVisitor: 0,
        metric: "Start CVR",
        lift: null,
        chance: null,
        confidence: null,
        why: null,
      },
      {
        test: "Landing hero",
        note: "#6 · from 14 Oct 2026",
        arm: "Presenter video",
        control: false,
        visitors: 113,
        startCvr: 0.053,
        submissions: 4,
        paymentCvr: 0,
        revPerSub: 0,
        revPerVisitor: 0,
        metric: "Start CVR",
        lift: -0.47,
        chance: 0.087,
        confidence: 0.83,
        why: null,
      },
      {
        test: "Pricing 3.0",
        note: "#5 · from 9 Oct 2026",
        arm: "A3 · higher prices",
        control: true,
        visitors: null,
        startCvr: null,
        submissions: 49,
        paymentCvr: 0,
        revPerSub: 0,
        revPerVisitor: null,
        metric: "Payment CVR",
        lift: null,
        chance: null,
        confidence: null,
        why: null,
      },
      {
        test: "Pricing 3.0",
        note: "#5 · from 9 Oct 2026",
        arm: "B3 · lower prices",
        control: false,
        visitors: null,
        startCvr: null,
        submissions: 49,
        paymentCvr: 0,
        revPerSub: 0,
        revPerVisitor: null,
        metric: "Payment CVR",
        lift: null,
        chance: null,
        confidence: null,
        why: "Too few to call",
      },
    ],
    note: "The registry's running tests whose arms our records keep.",
  },
  audience: {
    dims: [
      dim("country", "Country", "visit"),
      dim("device", "Device", "visit"),
      dim("visitor", "New vs returning", "visit"),
      { ...dim("daypart", "Time of day", "visit"), blocked: "From PostHog's visits: not read." },
      dim("gender", "Gender", "survey"),
      dim("age", "Age", "survey"),
      dim("relationship", "Relationship", "survey"),
      dim("archetype", "Archetype", "survey"),
    ],
  },
  quality: {
    dots: [
      {
        name: "Performance Max",
        spend: 600,
        clicks: 1200,
        cpc: 0.5,
        clickToPaid: 0,
        payers: 0,
      },
      { name: "Search", spend: 400, clicks: 800, cpc: 0.5, clickToPaid: 0, payers: 0 },
    ],
    why: null,
  },
};

// ---------------------------------------------------------------------------------------------

const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
// The CSV as the page hands it over, without a download.
const exported = vi.hoisted(() => ({
  sections: [] as Array<{ name: string; table: Table }>,
  tiles: [] as Tile[],
}));
vi.mock("@features/admin/ui/ap/csv", () => ({
  exportTables: (_file: string, sections: Array<{ name: string; table: Table }>, tiles: Tile[]) => {
    exported.sections = sections;
    exported.tiles = tiles;
  },
}));

import ApTraffic from "@features/admin/ui/ap/ApTraffic";

afterEach(() => {
  cleanup();
  view.payload = payload;
});
view.payload = payload;

const TILES = [
  "Ad spend",
  "CPC",
  "Visitors",
  "Survey submission CVR",
  "Contribution / visitor",
  "Revenue / visitor",
  "ROAS",
  "Visitor → paid",
  "Purchase CVR",
];
/** A tile's parts: the tiles come before every other use of their labels. */
const tile = (label: string) => screen.getAllByText(label)[0]!.parentElement!;
const tileValue = (label: string) => tile(label).children[1]!.textContent;
const tileChange = (label: string) => tile(label).children[2]!;

const perf = (dimension = "channel") =>
  screen.getByRole("table", { name: `Performance by ${dimension}` });
const names = (t: HTMLElement) =>
  within(t)
    .getAllByRole("rowheader")
    .map((h) => h.firstChild!.textContent);
/** The row a name heads. */
const rowOf = (t: HTMLElement, name: string) =>
  within(t)
    .getAllByRole("row")
    .find((r) => within(r).queryByRole("rowheader")?.firstChild?.textContent === name)!;
const headers = (t: HTMLElement) =>
  within(t)
    .getAllByRole("columnheader")
    .map((h) => h.textContent);
const breakDownBy = (value: string) =>
  fireEvent.change(screen.getByLabelText("Break down by"), { target: { value } });

/** No figure on the page reads as a JavaScript accident. */
const clean = () => expect(document.body.innerHTML).not.toMatch(/NaN|Infinity|undefined/);

describe("the Traffic page as drawn", () => {
  it("lays the sections out in the section bar's order, with their headings and the section nav", () => {
    render(<ApTraffic />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Traffic");
    // Cost vs quality fourth, as the section bar lists it (the artboard drew it last).
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Executive scorecard",
      "Traffic and submissions by channel",
      "Performance by channel",
      "Funnel leakage by channel",
      "Cost vs quality",
      "Buyers vs curiosity clicks",
      "Cohorts by acquisition source",
      "Experiments",
      "Audience by source",
    ]);
    expect([...document.querySelectorAll("section[id]")].map((s) => s.id)).toEqual([
      "scorecard",
      "channel-trend",
      "performance",
      "leakage",
      "quality",
      "intent",
      "cohorts",
      "experiments",
      "audience",
    ]);
    const nav = within(screen.getByRole("navigation", { name: "Traffic sections" }));
    expect(
      nav.getAllByRole("link").map((l) => `${l.textContent} ${l.getAttribute("href")}`)
    ).toEqual([
      "Scorecard #scorecard",
      "Performance #performance",
      "Funnel leakage #leakage",
      "Cost vs quality #quality",
      "Creatives & intent #intent",
      "Cohorts #cohorts",
      "Experiments #experiments",
      "Audience #audience",
    ]);
    expect(nav.getByRole("link", { name: "Scorecard" })).toHaveAttribute("aria-current", "true");
    // Attribution: under half the visitors with a source reads red; no purchases yet.
    expect(screen.getByText("Visitors with a source").nextSibling).toHaveTextContent("42.0%");
    expect(screen.getByText("Visitors with a source").nextSibling).toHaveClass("text-ap-bad");
    expect(screen.getByText("Unattributed visitors").nextSibling).toHaveTextContent("995 of 3,239");
    expect(screen.getByText("Purchases with a source").nextSibling).toHaveTextContent("—");
    clean();
  });

  it("draws the nine tiles as written, the contribution following the assumptions", () => {
    render(<ApTraffic />);
    expect(TILES.map(tileValue)).toEqual([
      "€1,000",
      "€0.50",
      "10,000",
      "4.00%",
      "−€0.092",
      "€0.0100",
      "0.10×",
      "0.040%",
      "1.00%",
    ]);
    // Spend's change is grey whichever way it goes; visitors' green as they rose.
    expect(tileChange("Ad spend")).toHaveTextContent("+25.0%");
    expect(tileChange("Ad spend")).toHaveClass("text-ap-muted");
    expect(tileChange("Visitors")).toHaveClass("text-ap-good");
    expect(tile("Contribution / visitor").children[1]).toHaveClass("text-ap-bad");

    // The scorecard, step by step.
    const score = within(document.getElementById("scorecard")!);
    for (const text of [
      "€0.50 per click",
      "€0.10 per visitor",
      "9.00% start CVR",
      "44.4% completion",
      "1.00% purchase CVR",
      "€250 CAC",
      "€25.00 AOV",
      "0.10× ROAS",
      "−€924",
      "−€0.092 per visitor",
    ])
      expect(score.getByText(text)).toBeTruthy();

    // 20% VAT: €83.33 net, so the loss grows to €940.57.
    fireEvent.change(screen.getByLabelText("VAT on revenue %"), { target: { value: "20" } });
    expect(tileValue("Contribution / visitor")).toBe("−€0.094");
    expect(score.getByText("−€941")).toBeTruthy();
    // Every contribution figure follows: Google Ads' row of the table too (€62.50 net).
    const google = () => within(rowOf(perf(), "Google Ads")).getAllByRole("cell").at(-2)!;
    expect(google().textContent).toBe("−€955");
    // A cleared input counts as its default again.
    fireEvent.change(screen.getByLabelText("VAT on revenue %"), { target: { value: "" } });
    expect(tileValue("Contribution / visitor")).toBe("−€0.092");
    expect(google().textContent).toBe("−€943");
    clean();
  });

  it("switches the breakdown, and says why where one isn't tracked", () => {
    render(<ApTraffic />);
    expect(names(perf())).toEqual([
      "Direct / unattributed",
      "AI assistants",
      "Google Ads",
      "All channels",
    ]);
    expect(screen.getByText("Sample split · totals are live")).toBeTruthy();

    breakDownBy("keyword");
    expect(screen.getByRole("heading", { name: "Performance by search term" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Funnel leakage by search term" })).toBeTruthy();
    expect(names(perf("search term")).sort()).toEqual(["brand", "love test"]);

    breakDownBy("creative");
    expect(screen.queryByRole("table", { name: "Performance by creative" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Funnel leakage by creative" })).toBeNull();
    // In the performance and the leakage sections, and on the creatives tab (not shown).
    expect(screen.getAllByText(CREATIVE_WHY)).toHaveLength(3);

    // A blocked row keeps its name, its figures blank and its reason under it.
    breakDownBy("device");
    const tablet = rowOf(perf("device"), "Tablet");
    expect(within(tablet).getByRole("rowheader")).toHaveTextContent(`Tablet${TABLET_WHY}`);
    expect(
      new Set(
        within(tablet)
          .getAllByRole("cell")
          .map((c) => c.textContent)
      )
    ).toEqual(new Set(["—"]));
    // A "Not live" assessment stays at the bottom, greyed.
    breakDownBy("assessment");
    expect(names(perf("assessment"))).toEqual(["Assessment A", "Assessment B"]);
    clean();
  });

  it("switches the column set, the rank chart and the sort as the design does", () => {
    render(<ApTraffic />);
    expect(headers(perf())).toEqual([
      "Channel",
      "Visitors",
      "Spend",
      "Start CVR",
      "Completion CVR",
      "Purchase CVR",
      "Visitor → paid",
      "AOV",
      "CAC",
      "Rev. / visitor",
      "ROAS",
      "Contribution",
      "Contrib. / visitor",
    ]);
    expect(screen.getByText("Contrib. / visitor by channel")).toBeTruthy();

    // Cost: Contrib. / visitor isn't in it, so its last column ranks.
    fireEvent.click(within(screen.getByRole("group", { name: "Column set" })).getByText("Cost"));
    expect(headers(perf())).toEqual([
      "Channel",
      "Spend",
      "CPM",
      "CTR",
      "CPC",
      "Cost / complete",
      "Cost / pre-unlock",
      "Cost / full unlock",
      "CAC",
      "ROAS",
    ]);
    const rankBy = within(screen.getByRole("group", { name: "Rank by" }));
    expect(rankBy.getByRole("button", { name: "ROAS" })).toHaveAttribute("aria-pressed", "true");
    expect(
      within(document.getElementById("performance")!).getByText(/^Pre-unlock figures are blank/)
    ).toBeTruthy();
    // A cost ranks cheapest first, and says lower is better.
    fireEvent.click(rankBy.getByRole("button", { name: "CPM" }));
    expect(screen.getByText("CPM by channel · lower is better")).toBeTruthy();

    fireEvent.click(within(screen.getByRole("group", { name: "Column set" })).getByText("Funnel"));
    const byVisitors = within(perf()).getByRole("button", { name: "Sort by Visitors" });
    fireEvent.click(byVisitors);
    expect(names(perf())).toEqual([
      "Google Ads",
      "Direct / unattributed",
      "AI assistants",
      "All channels",
    ]);
    expect(screen.getByText("Visitors by channel")).toBeTruthy();
    expect(rankBy.getByRole("button", { name: "Visitors" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(byVisitors);
    expect(names(perf())).toEqual([
      "AI assistants",
      "Direct / unattributed",
      "Google Ads",
      "All channels",
    ]);
    clean();
  });

  it("puts every campaign on the bottom line while none has a buyer, and says so", () => {
    render(<ApTraffic />);
    expect(
      screen.getByText(
        "No purchases from these campaigns in this range yet, so every campaign sits on the bottom line."
      )
    ).toBeTruthy();
    // Without a buyer there are no curves of equal CAC.
    expect(screen.queryByText(/^CAC €/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search terms" }));
    expect(screen.getByText("No purchases yet, so no buyer index.")).toBeTruthy();
    clean();
    cleanup();

    // A filter the ads can't follow: the campaigns still drawn, and the reason said under them.
    const why = "Ad spend can't be split by device here.";
    view.payload = { ...payload, quality: { ...payload.quality, why } };
    render(<ApTraffic />);
    expect(within(document.getElementById("quality")!).getByText(why)).toBeTruthy();
    // No campaign at all: the reason in place of the chart.
    cleanup();
    view.payload = { ...payload, quality: { dots: [], why: "Google Ads was not read." } };
    render(<ApTraffic />);
    expect(
      within(document.getElementById("quality")!).getByText("Google Ads was not read.")
    ).toBeTruthy();
    expect(screen.queryByText(/every campaign sits on the bottom line/)).toBeNull();
  });

  it("shows the visitors chart's reason where PostHog wasn't read", () => {
    view.payload = {
      ...payload,
      trend: {
        ...payload.trend,
        visitors: null,
        visitorsWhy: "PostHog was not read for this range.",
      },
    };
    render(<ApTraffic />);
    expect(screen.getByText("PostHog was not read for this range.")).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Visitors per week" })).toBeNull();
    expect(screen.getByRole("table", { name: "Survey submissions per week" })).toBeTruthy();
  });

  it("hands the current breakdown and the nine figures to the CSV", () => {
    render(<ApTraffic />);
    breakDownBy("keyword");
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(exported.sections.map((s) => s.name)).toEqual(["Performance by search term"]);
    expect(exported.sections[0]!.table.rows.map((r) => r.label)).toEqual(["love test", "brand"]);
    expect(exported.tiles.map((t) => t.label)).toEqual(TILES);
  });

  it("never writes NaN, Infinity or undefined, whatever is picked", () => {
    render(<ApTraffic />);
    const pick = (group: string, label: string) =>
      fireEvent.click(within(screen.getByRole("group", { name: group })).getByText(label));
    for (const scale of ["Share %", "Total"]) {
      pick("Scale", scale);
      clean();
    }
    for (const b of [
      "channel",
      "campaign",
      "creative",
      "keyword",
      "audience",
      "landing",
      "assessment",
      "device",
      "tier",
      "visitor",
    ]) {
      breakDownBy(b);
      for (const set of ["Profit", "Funnel", "Cost", "Engagement & value", "All columns"]) {
        if (!screen.queryByRole("group", { name: "Column set" })) break;
        pick("Column set", set);
        clean();
      }
    }
    for (const tab of ["Search terms", "Creatives & messages"]) {
      pick("Show", tab);
      clean();
    }
    for (const [group, labels] of [
      ["From visits", ["Country", "Device", "New vs returning", "Time of day"]],
      ["From the survey", ["Gender", "Age", "Relationship", "Archetype"]],
    ] as const) {
      for (const label of labels) {
        pick(group, label);
        clean();
      }
    }
    pick("From visits", "Time of day");
    expect(screen.getByText("From PostHog's visits: not read.")).toBeTruthy();
  });
});
