// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChartSeries, FocusChart, FocusPayload } from "@features/admin/server/ap/focus";

const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import ApFocus from "@features/admin/ui/ap/ApFocus";

const DAYS = ["1 Oct", "2 Oct", "3 Oct", "4 Oct", "5 Oct", "6 Oct", "7 Oct"];
const line = (from: number, step: number) => DAYS.map((_, i) => from + i * step);

const s = (over: Partial<ChartSeries> & Pick<ChartSeries, "name" | "values">): ChartSeries => ({
  color: "purple",
  axis: "left",
  unit: "count",
  total: null,
  ...over,
});

/** A chart whose weeks are two points and whose month is one. */
function chart(
  key: string,
  title: string,
  day: ChartSeries[],
  over: Partial<FocusChart> = {}
): FocusChart {
  const sub = {
    day: `${title}, per day`,
    week: `${title}, per week`,
    month: `${title}, per month`,
  };
  const fold = (k: number) =>
    day.map((x) => ({ ...x, values: [x.values[0] ?? null, x.values[k] ?? null].slice(0, k) }));
  return {
    key,
    title,
    sub,
    views: {
      day: { labels: DAYS, series: day },
      week: { labels: ["28 Sep", "5 Oct"], series: fold(2) },
      month: { labels: ["Oct 2026"], series: fold(1) },
    },
    blocked: null,
    ...over,
  };
}

const payload: FocusPayload = {
  range: { from: "2026-10-01", to: "2026-10-07", label: "1 – 7 Oct 2026" },
  compare: { from: "2026-09-24", to: "2026-09-30", label: "24 – 30 Sep 2026" },
  generatedAt: "2026-10-08T10:00:00.000Z",
  notes: [],
  narrowed: null,
  launched: true,
  tiles: [
    {
      key: "revenue",
      label: "Revenue",
      unit: "eur",
      value: 1290.4,
      prev: 1000,
      goodWhen: "up",
      spark: [1, 2, 3],
      foot: "",
      blocked: null,
      trend: "",
    },
    {
      key: "spend",
      label: "Ad spend",
      unit: "eur",
      value: 1159.67,
      prev: 1195.59,
      goodWhen: "either",
      spark: [3, 2, 1],
      foot: "",
      blocked: null,
      trend: "",
    },
    {
      key: "new-users",
      label: "New users",
      unit: "count",
      value: 457,
      prev: 406,
      goodWhen: "up",
      spark: [1, 1, 2],
      foot: "",
      blocked: null,
      trend: "",
    },
  ],
  charts: [
    chart(
      "submissions",
      "Survey submissions",
      [
        s({ name: "Survey submissions", values: line(10, 2), total: 112 }),
        s({
          name: "Cost per submission",
          color: "ink",
          dotted: true,
          axis: "right",
          unit: "eur",
          lowerBetter: true,
          values: line(2, 0.1),
          total: 2.25,
        }),
        s({
          name: "Revenue per submission",
          color: "green",
          axis: "right",
          unit: "eur",
          values: line(0, 0),
          total: 0,
        }),
      ],
      { wide: true }
    ),
    chart("start-cvr", "Visitor → survey start", [
      // 10% to 10.2%: a 2% rise, grey.
      s({ name: "Start CVR", unit: "pct", values: line(0.1, 0.002 / 6), total: 0.0902 }),
    ]),
    chart(
      "completion",
      "Survey completion",
      [s({ name: "Completion CVR", unit: "pct", values: line(0.4, 0), total: 0.428 })],
      { leftMin: 1 }
    ),
    chart(
      "pre-unlock",
      "Completion → pre-unlock",
      [
        s({ name: "Pre-unlock rate", unit: "pct", values: DAYS.map(() => null) }),
        s({
          name: "Revenue per pre-unlock",
          color: "green",
          axis: "right",
          unit: "eur",
          values: DAYS.map(() => null),
        }),
      ],
      {
        blocked:
          "The Initial plan (the pre-unlock) isn't on sale yet, so nothing has been pre-unlocked.",
      }
    ),
    chart("full-unlock", "Completion → full unlock", [
      s({
        name: "Full-unlock rate",
        unit: "pct",
        values: [0.01, 0, 0.02, 0, 0, 0, 0.01],
        total: 0.006,
      }),
      s({
        name: "Revenue per full unlock",
        color: "green",
        axis: "right",
        unit: "eur",
        values: [29.99, null, 9.99, null, null, null, 19.99],
        total: 19.99,
      }),
    ]),
    chart("per-user", "Assessments per user", [
      s({
        name: "Assessments per user",
        unit: "ratio",
        values: [1, 1.05, 1, 1, 1.1, 1, 1],
        total: 1.02,
      }),
    ]),
  ],
  assessments: {
    best: {
      label: "Assessment A",
      sub: "Only live assessment · €0.00 revenue per submission, €2.51 cost per submission",
    },
    nps: { sub: "Not asked yet." },
    survey: { valueMs: 836_070, sub: "462 submissions in the range" },
    report: { valueMs: 168_403, sub: "357 readers with a measured visit · average 7.4 min" },
    rows: [
      {
        label: "Assessment A",
        sub: "Live · rank 1",
        live: true,
        nps: null,
        surveyMedianMs: 836_070,
        reportMedianMs: 168_403,
        reportSub: "live",
        submissions: 462,
        paidCvr: 0,
        revPerSub: 0,
        costPerSub: 2.51,
        trend: { values: [16, 15, 7, 12, 13, 15, 22], from: 15.0387, to: 15.7613 },
      },
      ...["Assessment B", "Assessment C"].map((label) => ({
        label,
        sub: "Not live",
        live: false,
        nps: null,
        surveyMedianMs: null,
        reportMedianMs: null,
        reportSub: "",
        submissions: null,
        paidCvr: null,
        revPerSub: null,
        costPerSub: null,
        trend: null,
      })),
    ],
    trendLabel: "Submissions trend · 7 days",
  },
};

afterEach(() => {
  cleanup();
  view.payload = payload;
});
view.payload = payload;

const region = (name: string) => screen.getByRole("region", { name });
/** A legend entry's figure and trend, by the series' name. */
const legend = (chartName: string, seriesName: string) =>
  within(region(chartName))
    .getAllByText(seriesName)
    .find((el) => el.tagName === "SPAN")!.nextElementSibling as HTMLElement;

describe("the Dashboard as drawn", () => {
  it("has the design's header, no breadcrumb, and its sections in order", () => {
    render(<ApFocus />);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Dashboard",
      "Survey submissions",
      "Visitor → survey start",
      "Survey completion",
      "Completion → pre-unlock",
      "Completion → full unlock",
      "Assessments per user",
      "Assessments",
    ]);
    expect(screen.getByText(/The few numbers that decide whether LoveIQ works/)).toBeTruthy();
  });

  it("tiles: whole euros, the change against the period before, grey for ad spend", () => {
    render(<ApFocus />);
    const tile = (label: string) => screen.getByText(label).parentElement!;
    expect(tile("Revenue").textContent).toContain("€1,290");
    expect(within(tile("Revenue")).getByText("+29.0%").className).toContain("text-ap-good");
    expect(tile("Ad spend").textContent).toContain("€1,160");
    expect(within(tile("Ad spend")).getByText("−3.0%").className).toContain("text-ap-muted");
    expect(tile("New users").textContent).toContain("457+12.6%");
  });

  it("the legend: totals by unit, and the trend grey under 3%, green or red by which way is good", () => {
    render(<ApFocus />);
    const subs = legend("Survey submissions", "Survey submissions");
    expect(subs.textContent).toBe("112↗ +120% trend");
    expect(within(subs).getByText("↗ +120% trend").className).toContain("text-ap-good");
    // A cost going up is bad.
    const cost = legend("Survey submissions", "Cost per submission");
    expect(cost.textContent).toBe("€2.25↗ +30% trend");
    expect(within(cost).getByText("↗ +30% trend").className).toContain("text-ap-bad");
    // Nothing earned: no change to speak of.
    const rev = legend("Survey submissions", "Revenue per submission");
    expect(rev.textContent).toBe("€0.00→ flat");
    expect(within(rev).getByText("€0.00").className).toContain("text-ap-good");
    // 10% to 10.2% is a 2% rise: still written, but grey.
    const start = legend("Visitor → survey start", "Start CVR");
    expect(start.textContent).toBe("9.02%↗ +2% trend");
    expect(within(start).getByText("↗ +2% trend").className).toContain("text-ap-muted");
    expect(legend("Survey completion", "Completion CVR").textContent).toBe("42.8%→ flat");
    // Days 1, 3 and 7 fitted where they are drawn: −28%; as three equally spaced points, −40%.
    expect(legend("Completion → full unlock", "Revenue per full unlock").textContent).toBe(
      "€19.99↘ −28% trend"
    );
    expect(legend("Assessments per user", "Assessments per user").textContent).toContain("1.02");
  });

  it("each chart groups by its own select: weeks get their labels and their points", () => {
    render(<ApFocus />);
    const card = region("Survey submissions");
    const points = () =>
      card.querySelector('polyline[data-series="Survey submissions"]')!.getAttribute("points")!;
    expect(points().split(" ")).toHaveLength(7);
    // Every day's label on a wide screen; three on a phone, where seven would collide.
    const xLabels = (only: string) =>
      [...card.querySelectorAll(`span.${only.replace(":", "\\:")}`)].map((e) => e.textContent);
    expect(xLabels("max-sm:hidden")).toEqual(DAYS);
    expect(xLabels("sm:hidden")).toEqual(["1 Oct", "4 Oct", "7 Oct"]);
    expect(
      within(card).getByText(
        "Survey submissions, per day · thin dashed lines show the linear trend"
      )
    ).toBeTruthy();

    fireEvent.change(within(card).getByLabelText("Group Survey submissions by"), {
      target: { value: "week" },
    });
    expect(points().split(" ")).toHaveLength(2);
    expect(xLabels("max-sm:hidden")).toEqual(["Wk 28 Sep", "Wk 5 Oct"]);
    expect(within(card).getByText(/Survey submissions, per week/)).toBeTruthy();
    // The other charts keep their own grain.
    const completion = region("Survey completion");
    expect(
      [...completion.querySelectorAll("span.max-sm\\:hidden")].map((e) => e.textContent)
    ).toEqual(DAYS);
    // Each chart's figures as a table for a screen reader, its drawing hidden.
    const table = within(card).getByRole("table", { name: "Survey submissions" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    // Hidden in a box, not on the table itself: a table sizes to its content and would push a
    // phone's page sideways (209px at 390px wide).
    expect(table).not.toHaveClass("sr-only");
    expect(table.parentElement).toHaveClass("sr-only");
    expect(card.querySelector("svg")!.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("draws axes as drawn: counts left, euros right, a floor of 100% for completion", () => {
    render(<ApFocus />);
    // Submissions top at 22 × 1.1 → 25; the right axis at €2.60 × 1.1 → €5.
    const subs = region("Survey submissions");
    for (const t of ["0", "6", "13", "19", "25", "€0.00", "€1.25", "€2.50", "€3.75", "€5.00"])
      expect(within(subs).getAllByText(t).length).toBeGreaterThan(0);
    const completion = region("Survey completion");
    for (const t of ["0%", "25%", "50%", "75%", "100%"])
      expect(within(completion).getAllByText(t).length).toBeGreaterThan(0);
    // A rate under 10% writes a tenth; the unlock chart's euros are whole.
    const full = region("Completion → full unlock");
    for (const t of ["0.0%", "0.6%", "1.3%", "1.9%", "2.5%", "€0", "€13", "€25", "€38", "€50"])
      expect(within(full).getAllByText(t).length).toBeGreaterThan(0);
    // Every series has its dashed least-squares line; a gap breaks the line into runs.
    expect(subs.querySelectorAll("polyline[data-trend]")).toHaveLength(3);
    expect(full.querySelectorAll('polyline[data-series="Revenue per full unlock"]')).toHaveLength(
      3
    );
  });

  it("a blocked chart keeps its title and says why in place of the chart", () => {
    render(<ApFocus />);
    const card = region("Completion → pre-unlock");
    expect(
      within(card).getByText(/isn't on sale yet, so nothing has been pre-unlocked/)
    ).toBeTruthy();
    expect(within(card).queryByRole("combobox")).toBeNull();
    expect(card.querySelector("polyline")).toBeNull();
    expect(within(card).queryByText("Pre-unlock rate")).toBeNull();
  });

  it("assessments: four tiles and the table, B and C not live", () => {
    render(<ApFocus />);
    const asm = region("Assessments");
    expect(within(asm).getByText("Best performing assessment").parentElement!.className).toContain(
      "bg-ap-purple/10"
    );
    const tile = (label: string) => within(asm).getByText(label).parentElement!.textContent;
    expect(tile("Median survey time · A")).toBe(
      "Median survey time · A14 min462 submissions in the range"
    );
    expect(tile("Median report time · A")).toBe(
      "Median report time · A2.8 min357 readers with a measured visit · average 7.4 min"
    );
    expect(tile("NPS · Assessment A")).toBe("NPS · Assessment A—Not asked yet.");
    const table = within(asm).getByRole("table", { name: "Assessments" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
    ).toEqual([
      "Assessment",
      "NPS",
      "Median survey time",
      "Median report time",
      "Submissions",
      "Paid CVR",
      "Rev. / submission",
      "Cost / submission",
      "Submissions trend · 7 days",
    ]);
    const [, a, b] = within(table).getAllByRole("row");
    expect(
      within(a!)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual([
      "—not asked yet",
      "14 minlive",
      "2.8 minlive",
      "462",
      "0.00%",
      "€0.00",
      "€2.51",
      "↗ +5% trend · 15 → 16 / day",
    ]);
    expect(within(a!).getByText(/trend · 15 → 16/).className).toContain("text-ap-good");
    expect(b!.textContent).toBe("Assessment BNot live———————not live");
    expect(within(b!).getByRole("rowheader").className).toContain("text-ap-muted");
  });

  it("never writes NaN, undefined or Infinity, at any grain", () => {
    const { container } = render(<ApFocus />);
    for (const grain of ["day", "week", "month"]) {
      for (const select of screen.getAllByRole("combobox"))
        fireEvent.change(select, { target: { value: grain } });
      expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});
