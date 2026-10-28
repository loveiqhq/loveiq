// @vitest-environment jsdom
/**
 * The Traffic page against Marcus's design (call of 21 Oct 2026): the decided items, from the
 * builder's payload to what the page draws.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdsResult } from "@features/admin/server/ap/ads";
import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildTraffic,
  tierOfCountryName,
  type AdsBy,
  type TrafficPayload,
} from "@features/admin/server/ap/traffic";
import { DEFAULT_ASSUMPTIONS, KPI_KEYS } from "@features/admin/server/ap/traffic-math";
import { FIELDS } from "@features/admin/ui/ap/fields";
import { COLS, pooledStep, rowValues } from "@features/admin/ui/ap/traffic-view";

import { factsFixture, sub } from "./ap-fixtures";

const TODAY = "2026-10-21";
const now = new Date("2026-10-21T10:00:00Z");
const filters = parseFilters({ period: "custom", from: "2026-10-12", to: "2026-10-18" }, TODAY);

const google = { src: "google", med: "cpc", ads: true } as const;
const organic = { src: "google", med: "organic", ads: false } as const;
const direct = { src: null, med: null, ads: false } as const;

const facts = factsFixture({
  from: "2026-10-12",
  to: "2026-10-18",
  asOf: TODAY,
  visits: [
    { day: "2026-10-14", arm: "white_card", src: "google", n: 150 },
    { day: "2026-10-14", arm: "white_video", src: null, n: 1000 },
    { day: "2026-10-15", arm: "white", src: null, n: 50 },
  ],
  starts: [],
  subs: [
    sub({
      id: 1,
      day: "2026-10-14",
      at: "2026-10-14T10:00:00Z",
      ...google,
      arm: "white_card",
      gender: "Woman",
      age: "25–34",
    }),
    sub({
      id: 2,
      day: "2026-10-14",
      at: "2026-10-14T11:00:00Z",
      ...google,
      arm: "white_video",
      device: "Desktop",
      tier: "default",
      gender: "I'd rather not label this",
      paidAt: "2026-10-14T12:00:00Z",
      sales: 1,
      revenue: 24.99,
      plan: "full_report",
      full: true,
    }),
    sub({
      id: 3,
      day: "2026-10-15",
      at: "2026-10-15T10:00:00Z",
      ...organic,
      arm: "white",
      gender: "Other",
    }),
    sub({
      id: 4,
      day: "2026-10-15",
      at: "2026-10-15T11:00:00Z",
      ...direct,
      arm: null,
      gender: null,
      paidAt: "2026-10-15T12:00:00Z",
      sales: 1,
      revenue: 9.99,
    }),
  ],
});

/** €100 of Google Ads spend over the week, 50 clicks. */
const ad = {
  byDay: new Map([
    ["2026-10-14", 60],
    ["2026-10-15", 40],
  ]),
  clicksByDay: new Map([
    ["2026-10-14", 30],
    ["2026-10-15", 20],
  ]),
  impressionsByDay: new Map([["2026-10-14", 1000]]),
  from: "2026-04-24",
  to: TODAY,
};

const ads: AdsResult = {
  ok: true,
  value: {
    campaigns: [
      { key: "performance_max", name: "Performance Max", cost: 100, clicks: 50, impressions: 1000 },
    ],
    keywords: [],
  },
};

/** Google Ads' own split of the €100: by device, and by country. */
const adsBy: AdsBy = {
  ok: true,
  device: [
    { date: "2026-10-14", device: "mobile", cost_eur: 60, clicks: 30, impressions: 600 },
    { date: "2026-10-15", device: "desktop", cost_eur: 30, clicks: 15, impressions: 300 },
    { date: "2026-10-15", device: "tablet", cost_eur: 9.5, clicks: 5, impressions: 90 },
    { date: "2026-10-15", device: "connected tv", cost_eur: 0.5, clicks: 0, impressions: 10 },
  ],
  geo: [
    { date: "2026-10-14", country: "United States", cost_eur: 50, clicks: 25, impressions: 500 },
    { date: "2026-10-14", country: "United Kingdom", cost_eur: 20, clicks: 10, impressions: 200 },
    { date: "2026-10-15", country: "Turkiye", cost_eur: 10, clicks: 5, impressions: 100 },
    { date: "2026-10-15", country: "New Zealand", cost_eur: 20, clicks: 10, impressions: 200 },
  ],
};

/** PostHog: nearly every Google Ads visit, few of the rest (all of them Direct here). */
const tag = { fb: false, ref: null, camp: null, term: null } as const;
const sessions = {
  ok: true as const,
  value: [
    { bucket: "2026-10-12", ...google, ...tag, sessions: 150 },
    { bucket: "2026-10-12", ...direct, ...tag, sessions: 10 },
  ],
};
const audience = {
  ok: true as const,
  value: [
    // By PostHog's own count the US leads; scaled to each source's visitors, China does.
    { dim: "country" as const, value: "US", ...google, fb: false, ref: null, sessions: 100 },
    { dim: "country" as const, value: "GB", ...google, fb: false, ref: null, sessions: 50 },
    { dim: "country" as const, value: "CN", ...direct, fb: false, ref: null, sessions: 10 },
  ],
};

const traffic = (over: Partial<Parameters<typeof buildTraffic>[0]> = {}) =>
  buildTraffic({
    facts,
    previous: null,
    ad,
    filters,
    today: TODAY,
    now,
    sessions,
    audience,
    ads,
    adsBy,
    ...over,
  });

const row = (p: TrafficPayload, table: keyof TrafficPayload["breakdowns"], key: string) =>
  p.breakdowns[table].rows.find((r) => r.key === key)!;

describe("the Traffic builder, as the design reads", () => {
  it("leaves spend blank for channels that pay for no ads, and still counts their contribution", () => {
    const p = traffic();
    expect(row(p, "channel", "google_ads").counts.spend).toBe(100);
    for (const k of ["organic_search", "ai", "social", "referral", "email", "direct"]) {
      expect(row(p, "channel", k)).toMatchObject({ noAdSpend: true, counts: { spend: null } });
    }
    // Meta's spend isn't read: blank, and no contribution either.
    const meta = row(p, "channel", "meta_ads");
    expect(meta.counts.spend).toBeNull();
    expect(meta.noAdSpend).toBeUndefined();
    expect(rowValues(meta, DEFAULT_ASSUMPTIONS).contrib).toBeNull();
    // Direct's €9.99 buyer: no spend, cost per complete or CAC, a contribution without ads.
    const v = rowValues(row(p, "channel", "direct"), DEFAULT_ASSUMPTIONS);
    expect(v).toMatchObject({ spend: null, cpComplete: null, cac: null });
    expect(v.contrib).toBeCloseTo(9.99 - (9.99 * 0.029 + 0.25) - 0.05, 6);
    expect(p.breakdowns.channel.notes.join(" ")).toMatch(/The other channels pay for no ads/);
  });

  it("has a Funnel breakdown: the free survey without pay to start's buyers, its offers on their page", () => {
    const p = traffic();
    const t = p.breakdowns.funnel;
    expect(t.rows.map((r) => [r.name, r.muted ?? false])).toEqual([
      ["Free survey", false],
      ["Pay to start · full", true],
      ["Pay to start · €1.99 pre", true],
    ]);
    // No buyer bought first in the fixture: the free survey's people are everyone's, and its
    // spend is blank (the whole account's is under All funnels).
    expect(t.rows[0]!.counts).toEqual({
      ...p.breakdowns.channel.total!.counts,
      spend: null,
      clicks: null,
      impressions: null,
    });
    expect(t.total!.counts).toEqual(p.breakdowns.channel.total!.counts);
    for (const r of t.rows.slice(1)) {
      expect(r.blocked).toBe(
        "Pay to start's visits, spend and sales by offer are on the Pay to start page."
      );
      expect(Object.values(rowValues(r, DEFAULT_ASSUMPTIONS)).every((x) => x === null)).toBe(true);
    }
    // A survey bought first leaves the free survey's row, not All funnels'.
    const withBuyer = traffic({
      facts: factsFixture({
        subs: [...factsFixture().subs, sub({ id: 77, day: "2026-10-03", pts: true })],
      }),
    });
    expect(withBuyer.breakdowns.funnel.rows[0]!.counts.completes).toBe(
      withBuyer.breakdowns.funnel.total!.counts.completes - 1
    );
  });

  it("counts pre-unlocks per finisher once on sale, and says so over an earlier range", () => {
    // The fixture's range (1-7 Oct) is before the EUR 1.99 was on sale (23 Oct).
    const early = traffic();
    expect(early.breakdowns.channel.total!.counts.prePayers).toBeNull();
    expect(early.breakdowns.channel.notes.join(" ")).toMatch(
      /^.*Pre-unlock figures start 23 Oct 2026, the first whole day the €1\.99 Core Archetype was on sale/
    );
    const at = Date.parse("2026-10-25T12:00:00Z") / 1000;
    const late = traffic({
      filters: parseFilters(
        { period: "custom", from: "2026-10-24", to: "2026-10-30" },
        "2026-10-31"
      ),
      facts: factsFixture({
        from: "2026-10-24",
        to: "2026-10-30",
        subs: [
          sub({
            id: 1,
            day: "2026-10-25",
            at: "2026-10-25T10:00:00Z",
            pays: [[at, 1.99, "initial"]],
          }),
          sub({ id: 2, day: "2026-10-25", at: "2026-10-25T11:00:00Z" }),
          // E07's EUR 0 gift is no pre-unlock.
          sub({ id: 3, day: "2026-10-26", at: "2026-10-26T10:00:00Z", pays: [[at, 0, "initial"]] }),
        ],
        money: [],
      }),
      today: "2026-10-31",
    });
    const total = late.breakdowns.channel.total!;
    expect(total.counts.prePayers).toBe(1);
    expect(rowValues(total, DEFAULT_ASSUMPTIONS).pre).toBeCloseTo(1 / 3);
    expect(late.breakdowns.channel.notes.join(" ")).not.toMatch(/Pre-unlock figures start/);
  });

  it("averages each funnel step over its own base, never by visitors", () => {
    const row = (starts: number, completes: number, comp: number | null, visitors: number) => ({
      r: { counts: { starts, completes, visitors } } as never,
      v: { comp } as never,
    });
    // 40 of 100 and 9 of 10 complete; a row without the rate is left out. By visitors (1,000
    // and 10) it would read 40.5%; pooled it is 49 of 110.
    expect(
      pooledStep([row(100, 40, 0.4, 1000), row(10, 9, 0.9, 10), row(50, 50, null, 500)], "comp")
    ).toBeCloseTo(49 / 110, 10);
  });

  it("keeps Google Ads' own figures on a row blank for its people (tablets before 17 Oct)", () => {
    const tablet = {
      ...row(traffic(), "device", "tablet"),
      blocked: "Tablets are told apart from 17 Oct 2026: pick a range from that day on.",
    };
    const v = rowValues(tablet, DEFAULT_ASSUMPTIONS);
    expect([v.spend, v.cpc]).toEqual([9.5, 1.9]);
    expect([v.completes, v.cpComplete, v.vis]).toEqual([null, null, null]);
  });

  it("splits spend by device and country tier as Google Ads does, the rows adding up to the tile", () => {
    const p = traffic();
    expect(
      p.breakdowns.device.rows.map((r) => [
        r.name,
        r.counts.spend,
        r.counts.clicks,
        r.muted ?? false,
      ])
    ).toEqual([
      ["Mobile", 60, 30, false],
      ["Desktop", 30, 15, false],
      ["Tablet", 9.5, 5, false],
      ["Other devices", 0.5, 0, true],
    ]);
    const tiers = Object.fromEntries(p.breakdowns.tier.rows.map((r) => [r.key, r.counts.spend]));
    expect(tiers).toMatchObject({
      tier_1: 50,
      tier_2: 20,
      tier_3: 10,
      tier_4: 0,
      tier_5: 0,
      default: 20,
    });
    const sum = (t: "device" | "tier") =>
      p.breakdowns[t].rows.reduce((a, r) => a + (r.counts.spend ?? 0), 0);
    expect(sum("device")).toBeCloseTo(p.tiles.now.spend!, 6);
    expect(sum("tier")).toBeCloseTo(p.tiles.now.spend!, 6);
    // Cost per complete: the device's spend over its three finishers (every source's: blended).
    const mobile = rowValues(row(p, "device", "phone"), DEFAULT_ASSUMPTIONS);
    expect(mobile.cpComplete).toBe(60 / 3);
    expect(mobile.cpc).toBe(2);
    expect(p.breakdowns.device.notes[0]).toMatch(/blended/);
    // Another source's filter, or a device filter: no spend per row.
    for (const over of [{ source: "organic_search" as const }, { device: "phone" as const }]) {
      const q = traffic({ filters: { ...filters, ...over } });
      for (const r of q.breakdowns.device.rows) expect(r.counts.spend ?? null).toBeNull();
    }
  });

  it("puts a country Google Ads names in its price tier", () => {
    expect(tierOfCountryName("United States")).toBe("tier_1");
    expect(tierOfCountryName("United Kingdom")).toBe("tier_2");
    expect(tierOfCountryName("Turkiye")).toBe("tier_3");
    expect(tierOfCountryName("Türkiye")).toBe("tier_3");
    expect(tierOfCountryName("Vietnam")).toBe("tier_5");
    expect(tierOfCountryName("New Zealand")).toBe("default");
    expect(tierOfCountryName("Country 1234")).toBe("default");
  });

  it("names the live landing versions as the design does; retired ones keep their names", () => {
    const names = traffic().breakdowns.landing.rows.map((r) => r.name);
    expect(names).toContain("Hero · question card");
    expect(names).toContain("Hero · presenter video");
    expect(names.find((n) => n.startsWith("Landing Page V2"))).toBeTruthy();
  });

  it("orders the cohorts as drawn and writes the tests' notes in the design's style", () => {
    const p = traffic();
    expect(p.cohorts.rows.map((r) => r.source)).toEqual([
      "Google Ads",
      "Organic search",
      "Direct / unattributed",
    ]);
    expect([...new Set(p.experiments.arms.map((a) => `${a.test}: ${a.note}`))]).toEqual([
      "Landing hero: Since 14 Oct 2026 · live",
      "Pricing 3.0: Since 8 Oct 2026, 17:23 · live",
      "Email question: Since 9 Oct 2026 · live",
    ]);
  });

  it("folds the gender answers as drawn, and names a blank age Not shown", () => {
    const p = traffic();
    const gender = p.audience.dims.find((d) => d.key === "gender")!;
    expect(gender.values.map((v) => [v.label, v.share])).toEqual([
      ["Woman", 0.25],
      ["Other / not shown", 0.75],
    ]);
    const age = p.audience.dims.find((d) => d.key === "age")!;
    expect(age.values.map((v) => v.label)).toEqual(["25–34", "Not shown"]);
  });

  it("lists the countries by the share it shows, largest first", () => {
    const country = traffic().audience.dims.find((d) => d.key === "country")!;
    // Direct's 1,000 visitors are China's (PostHog's few Direct visits), Google Ads' 150 the US's
    // and the UK's: so China first, though PostHog itself saw it least.
    expect(country.values.map((v) => v.label)).toEqual([
      "China",
      "United States",
      "United Kingdom",
    ]);
    const shares = country.values.map((v) => v.share);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
    // The matrix's columns follow the same order.
    expect(country.bySource[0]!.shares).toEqual([0, 100 / 150, 50 / 150]);
  });

  it("gives each headline figure a line its info card can find by key", () => {
    const p = traffic();
    for (const k of KPI_KEYS) {
      const line = p.tiles[k]!;
      expect(line.key).toBe(k);
      expect(line.spark).toHaveLength(p.tiles.points.length);
    }
  });

  it("keeps the design's two attribution figures", () => {
    expect(Object.keys(traffic().attribution).sort()).toEqual([
      "unattributed",
      "visitorsWithSource",
      "why",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// The page

const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import ApTraffic from "@features/admin/ui/ap/ApTraffic";
import { metadata } from "@/app/admin/ap/assessment-a/traffic/page";

afterEach(() => cleanup());

/** €1,234.56 of spend, so a whole euro and a cent can be told apart. */
const page = (over: Partial<Parameters<typeof buildTraffic>[0]> = {}) => {
  view.payload = traffic({
    ad: { ...ad, byDay: new Map([["2026-10-14", 1234.56]]) },
    ...over,
  });
  return render(<ApTraffic />);
};
const perf = (dimension = "channel") =>
  screen.getByRole("table", { name: `Performance by ${dimension}` });
const breakDownBy = (value: string) =>
  fireEvent.change(screen.getByLabelText("Break down by"), { target: { value } });

describe("the Traffic page, as drawn", () => {
  it("titles the browser tab as the design does", () => {
    expect(metadata.title).toBe("AP-Analytics · Traffic");
  });

  it("writes whole euros where the design does, and cents where it keeps them", () => {
    page();
    const tile = screen.getAllByText("Ad spend")[0]!.parentElement!;
    expect(tile.children[1]!.textContent).toBe("€1,235");
    const score = within(document.getElementById("scorecard")!);
    expect(score.getAllByText("€1,235")).toHaveLength(1);
    expect(score.getByText(/^2 purchases · €617 CAC$/)).toBeTruthy();
    expect(score.getByText("€24.69 per click")).toBeTruthy();
    // The performance table: Spend, CAC, Cost / full unlock whole; Cost / complete to the cent.
    fireEvent.click(within(screen.getByRole("group", { name: "Column set" })).getByText("Cost"));
    const cellsOf = (row: HTMLElement) =>
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent);
    const rows = within(perf()).getAllByRole("row");
    const google = rows.find((r) =>
      within(r).queryByRole("rowheader")?.textContent?.startsWith("Google Ads")
    )!;
    // Spend, CPM, CTR, CPC, Cost / complete, Cost / pre-unlock, Cost / full unlock, CAC, ROAS
    expect(cellsOf(google)).toEqual([
      "€1,235",
      "€1,234.56",
      "5.0%",
      "€24.69",
      "€617.28",
      "—",
      "€1,235",
      "€1,235",
      "0.02×",
    ]);
    // The total row fills only the columns the design's does: the ad figures are Google's own.
    expect(cellsOf(rows.at(-1)!)).toEqual([
      "€1,235",
      "",
      "",
      "",
      "€308.64",
      "",
      "",
      "€617",
      "0.03×",
    ]);
  });

  it("describes the scorecard as the design does", () => {
    page();
    expect(
      within(document.getElementById("scorecard")!).getByText(
        "From ad spend to contribution profit for the selected period, with the conversion between each step. Buyers and revenue are the period's finishers and what they bought so far, not payments by the day they were made."
      )
    ).toBeTruthy();
  });

  it("shows two attribution figures, each with its card", () => {
    page();
    expect(screen.queryByText("Buyers with a source")).toBeNull();
    for (const label of ["Visitors with a source", "Unattributed visitors"])
      expect(screen.getByRole("button", { name: `About ${label}` })).toBeTruthy();
  });

  it("breaks down by funnel, pay to start blank with the reason under the table", () => {
    page();
    const options = within(screen.getByLabelText("Break down by"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options.slice(0, 3)).toEqual(["Channel", "Funnel", "Campaign"]);
    breakDownBy("funnel");
    const t = perf("funnel");
    const names = within(t)
      .getAllByRole("rowheader")
      .map((h) => h.textContent);
    // The design's total row last: today the free survey's, as everyone came through it.
    expect(names).toEqual([
      "Free survey",
      "Pay to start · full",
      "Pay to start · €1.99 pre",
      "All funnels",
    ]);
    const pre = within(t).getAllByRole("row").at(-2)!;
    expect(
      new Set(
        within(pre)
          .getAllByRole("cell")
          .map((c) => c.textContent)
      )
    ).toEqual(new Set(["—"]));
    expect(
      within(document.getElementById("performance")!).getByText(
        /^Pay to start · full and Pay to start · €1\.99 pre: pay to start's visits, spend and sales by offer are on the Pay to start page/
      )
    ).toBeTruthy();
  });

  it("shows each row's name alone, in the table and the leakage", () => {
    page();
    const p = view.payload as TrafficPayload;
    const names = p.breakdowns.channel.rows.map((r) => r.name);
    for (const [name, extra] of [
      ["Performance by channel", ["All channels"]],
      ["Funnel leakage by channel", []],
    ] as const) {
      const headers = within(screen.getByRole("table", { name }))
        .getAllByRole("rowheader")
        .map((h) => h.textContent);
      expect(new Set(headers)).toEqual(new Set([...names, ...extra]));
    }
  });

  it("sorts by name Z to A on the first click, as the design does", () => {
    page();
    fireEvent.click(within(perf()).getByRole("button", { name: "Sort by Channel" }));
    const names = within(perf())
      .getAllByRole("rowheader")
      .map((h) => h.textContent)
      .slice(0, -1);
    expect(names).toEqual([...names].sort((a, b) => b!.localeCompare(a!)));
  });

  it("opens Buyers vs curiosity on the keywords", () => {
    page();
    expect(screen.getByRole("button", { name: "Keywords" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("puts an info icon on every figure, each one defined", () => {
    page();
    for (const label of [
      "Ad spend",
      "CPC",
      "Visitors",
      "Survey submission CVR",
      "Contribution / visitor",
      "Revenue / visitor",
      "ROAS",
      "Visitor → paid",
      "Purchase CVR",
      "Survey starts",
      "Completes",
      "Buyers",
      "Revenue",
      "Contribution",
      "Visitors per day",
      "Survey submissions per day",
      "Avg. cost per survey submission (submissions chart)",
    ])
      expect(screen.getAllByRole("button", { name: `About ${label}` }).length).toBeGreaterThan(0);
    // The last point's caption names its day ("20 Oct by channel").
    expect(screen.getAllByRole("button", { name: /^About .+ by channel$/ }).length).toBeGreaterThan(
      0
    );
    // Every column of the performance table, whatever the column set.
    fireEvent.click(
      within(screen.getByRole("group", { name: "Column set" })).getByText("All columns")
    );
    const heads = within(perf()).getAllByRole("columnheader").slice(1);
    expect(heads).toHaveLength(COLS.length);
    for (const h of heads) expect(within(h).getByRole("button", { name: /^About / })).toBeTruthy();
    // "CLV : cost / user" divides by spend per finisher, so it keeps that name.
    expect(screen.getByRole("button", { name: "About CLV : cost / user" })).toBeTruthy();
    // No icon on this page points at a field without a definition.
    const keys = [...document.querySelectorAll("button[aria-haspopup='dialog']")];
    expect(keys.length).toBeGreaterThan(40);
    for (const b of keys) expect(b.getAttribute("title")).not.toBe("Not defined yet.");
    expect(Object.keys(FIELDS).filter((k) => k.startsWith("traffic.")).length).toBeGreaterThan(70);
  });
});
