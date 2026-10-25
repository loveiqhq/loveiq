// @vitest-environment jsdom
// The Assessment A dashboard as Marcus's design and the 21 Oct 2026 call have it: the header
// names the preset, the tiles' notes, the renamed figures, and an info card on every figure.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDashboard, rangeText } from "@features/admin/server/ap/assessment";
import { head } from "@features/admin/server/ap/common";
import type { QuoteFact } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { FIELDS } from "@features/admin/ui/ap/fields";

import { factsFixture, sub } from "./ap-fixtures";

const TODAY = "2026-10-13";
const now = new Date("2026-10-13T10:00:00Z");
const filters = parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY);
const facts = factsFixture();
/** Ad spend recorded for every day of both weeks: €40 and €60 in the range. */
const ad = {
  byDay: new Map([
    ["2026-09-26", 50.4],
    ["2026-10-02", 40],
    ["2026-10-03", 60],
  ]),
  from: "2026-04-24",
  to: "2026-10-12",
};
/** The week before, from 18 Sep on (its starts complete), with one sale of its own. */
const lastWeek = factsFixture({
  from: "2026-09-24",
  to: "2026-09-30",
  visits: [{ day: "2026-09-25", arm: "white_card", src: null, n: 150 }],
  starts: [],
  subs: [sub({ id: 31, day: "2026-09-25", at: "2026-09-25T10:00:00Z" })],
  money: [{ ...facts.money[0]!, sid: 31, day: "2026-09-25", amount: 25 }],
});
/** An earlier week whose unfinished starts were only partly kept (before 18 Sep 2026). */
const early = factsFixture({ from: "2026-09-10", to: "2026-09-16", money: [] });

const dashboard = (over: Partial<Parameters<typeof buildDashboard>[0]> = {}) =>
  buildDashboard({
    facts,
    previous: lastWeek,
    ad,
    filters,
    today: TODAY,
    now,
    newReturning: null,
    ...over,
  });
const tile = (d: ReturnType<typeof dashboard>, key: string) => d.tiles.find((t) => t.key === key)!;

describe("the header's range", () => {
  const text = (q: Record<string, string>, today = "2026-10-21") => {
    const f = parseFilters(q, today);
    return rangeText(f, head(f, today, new Date(`${today}T10:00:00Z`)).compare);
  };

  it("names the preset, as drawn, and gives dates only for a custom range", () => {
    expect(text({ period: "30d" })).toBe("last 30 days vs previous 30");
    expect(text({ period: "7d" })).toBe("last 7 days vs previous 7");
    expect(text({ period: "90d" })).toBe("last 90 days vs previous 90");
    expect(text({ period: "today" })).toBe("today");
    expect(text({ period: "custom", from: "2026-10-01", to: "2026-10-07" })).toBe(
      "1 Oct – 7 Oct 2026 vs 24 Sep – 30 Sep 2026"
    );
  });

  it("says no 'vs' where nothing is compared", () => {
    // Last 12 months starts where the records do: its comparison is before them.
    expect(text({ period: "12m" })).toBe("last 12 months");
    expect(text({ period: "12m" }, "2027-06-01")).toBe("last 12 months vs previous 12 months");
    // A custom range running to today is not compared.
    expect(text({ period: "custom", from: "2026-10-14", to: "2026-10-21" })).toBe(
      "14 Oct – 21 Oct 2026"
    );
  });

  it("travels with the payload", () => {
    expect(dashboard().rangeText).toBe("1 Oct – 7 Oct 2026 vs 24 Sep – 30 Sep 2026");
  });
});

describe("the tiles", () => {
  it("call revenue over submissions what it is", () => {
    expect(tile(dashboard(), "rev-sub").label).toBe("€ rev. per survey submission");
    expect(tile(dashboard(), "complete-cvr").label).toBe("Survey submission CVR");
  });

  it("CAC: the earlier figure in whole euros, no spend, and the line named as drawn", () => {
    const cac = tile(dashboard(), "cac");
    // €100 over one payer now; €50.40 over one the week before.
    expect(cac).toMatchObject({ value: 100, prev: 50.4, foot: "vs €50" });
    expect(cac.foot).not.toMatch(/spend/);
    expect(cac.trend).toMatch(/ · line: € per submission$/);
    // With no comparison, it says what the figure is.
    expect(tile(dashboard({ previous: null }), "cac").foot).toBe(
      "Google Ads spend ÷ paying customers"
    );
  });

  it("start CVR says in grey why there is no comparison, never a bare change", () => {
    const blanked = tile(dashboard({ previous: early }), "start-cvr");
    expect(blanked.prev).toBeNull();
    expect(blanked.foot).toBe("No comparison: earlier starts incomplete · 14 starts");
    // Against a week whose starts are whole, the change stands and the note is the count.
    const compared = tile(dashboard(), "start-cvr");
    expect(compared.prev).not.toBeNull();
    expect(compared.foot).toBe("14 starts");
  });

  it("each have an info card, with this range's figures and the weekly line's tile", () => {
    const d = dashboard();
    expect(d.tiles.map((t) => t.info)).toEqual([
      "assessment.visits",
      "assessment.start-cvr",
      "assessment.submission-cvr",
      "assessment.pay-cvr",
      "assessment.rev-visit",
      "assessment.rev-sub",
      "assessment.revenue",
      "assessment.aov",
      "assessment.cac",
      "assessment.open-rate",
    ]);
    for (const t of d.tiles) expect(FIELDS[t.info], t.info).toBeDefined();
    // A rate shows its parts as the page prints them; a count, just its value.
    expect(tile(d, "start-cvr").worked).toEqual({ num: "14", den: "220", value: "6.36%" });
    expect(tile(d, "cac").worked).toEqual({ num: "€100.00", den: "1", value: "€100" });
    expect(tile(d, "visits").worked).toEqual({ value: "220" });
    // A blank figure has none.
    const tablets = dashboard({ filters: { ...filters, device: "tablet" } });
    expect(tile(tablets, "pay-cvr").worked).toBeUndefined();
  });
});

describe("the journey, scorecard and sources", () => {
  it("give every figure an info card; the KPIs nothing measures have none", () => {
    const d = dashboard();
    expect(d.journey.map((j) => j.info ?? null)).toEqual([
      "assessment.step-landing",
      null,
      "assessment.step-start",
      "assessment.step-submitted",
      "assessment.step-opened",
      "assessment.step-paywall",
      "assessment.step-paid",
    ]);
    expect(d.journey[2]!.worked).toEqual({ value: "14" });
    const measured = d.scorecard.filter((r) => r.value !== null);
    expect(measured.length).toBeGreaterThan(5);
    for (const r of measured) expect(FIELDS[r.info ?? ""], r.label).toBeDefined();
    for (const r of d.scorecard.filter((x) =>
      /Patient Hub|Cross-sell|Intervention|NPS/.test(x.label)
    ))
      expect(r.info).toBeUndefined();
    expect(d.scorecard.find((r) => r.label === "ROAS")!.worked).toEqual({
      num: "€6.99",
      den: "€100.00",
      value: "0.07",
    });
    expect(d.sources.columns.slice(1).map((c) => c.info)).toEqual([
      "assessment.src-visitors",
      "assessment.src-share",
      "assessment.src-subs",
      "assessment.src-cvr",
      "assessment.src-per-visit",
    ]);
  });
});

describe("the registry", () => {
  const ROOT = join(__dirname, "..");
  const page = ["ui/ap/ApDashboard.tsx", "server/ap/assessment.ts"]
    .map((f) => readFileSync(join(ROOT, f), "utf8"))
    .join("\n");
  const used = new Set([...page.matchAll(/["'`](assessment\.[a-z0-9-]+)["'`]/g)].map((m) => m[1]!));
  const defined = Object.keys(FIELDS).filter((k) => k.startsWith("assessment."));

  it("defines every field the page names, and nothing the page doesn't", () => {
    expect([...used].filter((k) => !FIELDS[k])).toEqual([]);
    expect(defined.filter((k) => !used.has(k))).toEqual([]);
  });

  it("says average or median and what it counts, and reads the period in every query", () => {
    for (const k of defined) {
      const d = FIELDS[k]!;
      expect(d.stat, k).toMatch(/^(Count|Sum|Share|Ratio|Average|Median|Price)/);
      expect(d.per, k).toMatch(/^per /);
      expect(d.query.text, k).toMatch(/:from\b/);
      expect(d.query.text, k).toMatch(/:to\b/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The screen.

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

afterEach(cleanup);

const quote = (plan: string, price: number): QuoteFact => ({
  plan,
  price,
  priceArm: "B",
  device: "iOS",
  tier: "tier_1",
  quoted: 10,
  paywall: 5,
  checkouts: 3,
  sales: 1,
  revenue: price,
  src: "google",
  med: "cpc",
  ads: true,
  fb: false,
  ref: null,
});

describe("the dashboard screen", () => {
  const show = () => {
    screenData.byUrl = {
      "/api/admin/ap/assessment": dashboard({
        facts: factsFixture({ quotes: [quote("full_report", 29)] }),
        newReturning: {
          ok: true,
          value: {
            new: { visitors: 90, started: 20, completed: 9 },
            returning: { visitors: 10, started: 3, completed: 1 },
          },
        },
        visitorGroups: { ok: true, value: new Map() },
      }),
    };
    return render(<ApDashboard />);
  };
  const about = (name: string) => screen.getAllByRole("button", { name: `About ${name}` });

  it("writes the range as the header names it", () => {
    show();
    expect(
      screen.getByText(/· 14 archetypes · 1 Oct – 7 Oct 2026 vs 24 Sep – 30 Sep 2026\.$/)
    ).toBeTruthy();
  });

  it("puts a defined info icon on the tiles, journey steps, scorecard and table columns", () => {
    const { container } = show();
    for (const name of [
      "Survey start CVR",
      "€ rev. per survey submission",
      "CAC (paid)",
      "Landing page",
      "Paid",
      "Completion CVR",
      "ROAS",
      "Submissions",
      "Quoted",
      "Price",
    ])
      expect(about(name).length, name).toBeGreaterThan(0);
    // Visitors: the tile and the Sources column, each with its own card.
    expect(about("Visitors")).toHaveLength(2);
    const icons = screen.getAllByRole("button", { name: /^About / });
    expect(icons.filter((b) => b.getAttribute("title") === "Not defined yet.")).toEqual([]);
    // A button never sits inside a link: the journey's boxes keep their link around the label.
    expect(container.querySelectorAll("a button")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Survey start" }).getAttribute("href")).toBe(
      "/admin/ap/assessment-a/survey"
    );
  });

  it("names the Performance chart as the tile does, with info icons on both charts", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Performance" }));
    // The tile's label and the chart's title.
    expect(screen.getAllByText("Survey submission CVR", { selector: "span" })).toHaveLength(2);
    expect(screen.queryByText("Survey complete CVR")).toBeNull();
    expect(about("Survey submission CVR").length).toBe(2);
    expect(about("€ revenue per visit")).toHaveLength(1);
  });

  it("gives New & return's figures their cards", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "New & return" }));
    // Each card is named as the page names its figure.
    expect(about("New visitors")).toHaveLength(1);
    expect(about("Returning visitors")).toHaveLength(1);
    expect(about("Survey CVR").length).toBeGreaterThanOrEqual(2);
    expect(about("€ / visit").length).toBeGreaterThanOrEqual(2);
  });
});

describe("the browser tab", () => {
  it("is titled as the design's board", async () => {
    const { metadata } = await import("@/app/admin/ap/assessment-a/page");
    expect(metadata.title).toBe("AP-Analytics · Assessment A dashboard");
  });
});
