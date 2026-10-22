import { describe, expect, it } from "vitest";

import type { AdsResult } from "@features/admin/server/ap/ads";
import type { StartFact } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildTraffic } from "@features/admin/server/ap/traffic";

import { factsFixture, sub } from "./ap-fixtures";

const TODAY = "2026-10-13";
const now = new Date("2026-10-13T10:00:00Z");
const filters = parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY);

/** GA4's spend, clicks and impressions for the week: €100 over 50 clicks. */
const ad = {
  byDay: new Map([
    ["2026-10-02", 40],
    ["2026-10-03", 60],
  ]),
  clicksByDay: new Map([
    ["2026-10-02", 20],
    ["2026-10-03", 30],
  ]),
  impressionsByDay: new Map([["2026-10-02", 900]]),
  from: "2026-04-24",
  to: TODAY,
};

/** The Ads API's split of the same week: one campaign, one keyword under it. */
const ads: AdsResult = {
  ok: true,
  value: {
    campaigns: [
      { key: "price_time_test", name: "Price + Time Test", cost: 70, clicks: 35, impressions: 600 },
      { key: "performance_max", name: "Performance Max", cost: 30, clicks: 15, impressions: 300 },
    ],
    keywords: [
      {
        key: "love test",
        name: "love test",
        campaign: "price_time_test",
        cost: 20,
        clicks: 10,
        impressions: 100,
      },
    ],
  },
};

const start = (over: Partial<StartFact>): StartFact => ({
  day: "2026-10-02",
  known: true,
  src: "google",
  med: "cpc",
  ads: true,
  arm: "white_card",
  device: "iOS",
  finished: false,
  camp: "price_time_test",
  term: "love test",
  cq: null,
  email: false,
  n: 1,
  ...over,
});

const facts = factsFixture({
  starts: [
    start({ n: 3 }),
    // The same tags on an Instagram visit: not a Google Ads start.
    start({ src: "ig", med: "social", ads: false, n: 5 }),
  ],
  subs: [
    sub({ id: 1, camp: "price_time_test", term: "love test", paidAt: "2026-10-02T12:00:00Z" }),
    sub({ id: 2, camp: "price_time_test", term: "love test", device: "Desktop" }),
    sub({ id: 3, camp: "performance_max" }),
    sub({
      id: 4,
      src: "ig",
      med: "social",
      ads: false,
      camp: "price_time_test",
      term: "love test",
    }),
  ],
});

const traffic = (over: Partial<Parameters<typeof buildTraffic>[0]> = {}) =>
  buildTraffic({
    facts,
    previous: null,
    ad,
    filters,
    today: TODAY,
    now,
    sessions: null,
    audience: null,
    ads,
    ...over,
  });

describe("Traffic page builder", () => {
  it("campaign and search-term rows: the Ads API's cost beside Google Ads finishers only", () => {
    const p = traffic();
    const row = (table: "campaign" | "keyword", key: string) =>
      p.breakdowns[table].rows.find((r) => r.key === key)!;
    expect(row("campaign", "price_time_test").counts).toMatchObject({
      spend: 70,
      clicks: 35,
      impressions: 600,
      completes: 2,
      payers: 1,
    });
    expect(row("campaign", "performance_max").counts).toMatchObject({ spend: 30, completes: 1 });
    // The keyword's starts are Google Ads starts only: the Instagram ones with its tags are not.
    expect(row("keyword", "price_time_test|love test").counts).toMatchObject({
      spend: 20,
      clicks: 10,
      starts: 3,
      completes: 2,
    });
    expect(p.quality.dots.map((d) => [d.name, d.payers, d.clickToPaid])).toEqual([
      ["Price + Time Test", 1, 1 / 35],
      ["Performance Max", 0, 0],
    ]);
    expect(p.quality.why).toBeNull();
  });

  it("totals: the Google Ads rows added up, and everyone for device, tier and visitor type", () => {
    const p = traffic();
    // Both campaigns: €70 + €30, 35 + 15 clicks; the three Google Ads finishers.
    // Its starts are every Google Ads start (a finisher with no campaign tag included), not the
    // rows' starts added up.
    expect(p.breakdowns.campaign.total).toMatchObject({
      name: "All campaigns",
      counts: { spend: 100, clicks: 50, impressions: 900, completes: 3, payers: 1, starts: 3 },
    });
    // One keyword row only: no total row.
    expect(p.breakdowns.keyword.total).toBeNull();
    for (const [k, name] of [
      ["device", "All devices"],
      ["tier", "All country tiers"],
      ["visitor", "All visitor types"],
    ] as const) {
      expect(p.breakdowns[k].total).toMatchObject({ name, counts: { completes: 4 } });
    }
    // The live assessment only.
    expect(p.breakdowns.assessment.rows.map((r) => r.name)).toEqual(["Assessment A"]);
  });

  it("under a filter ad spend can't follow, leaves the Ads API's figures out and says why", () => {
    const why = "Ad spend can't be split by device here.";
    const p = traffic({ filters: { ...filters, device: "phone" } });
    for (const table of ["campaign", "keyword"] as const) {
      for (const r of p.breakdowns[table].rows) {
        expect(r.counts).toMatchObject({ spend: null, clicks: null, impressions: null });
      }
      expect(p.breakdowns[table].notes).toContain(`Spend, clicks and impressions: ${why}`);
    }
    // Only phone finishers: the desktop one is out.
    const camp = p.breakdowns.campaign.rows.find((r) => r.key === "price_time_test")!;
    expect(camp.counts.completes).toBe(1);
    // No dots of all-traffic cost against phone payers.
    expect(p.quality).toEqual({ dots: [], why });
    expect(p.tiles.blocked.spend).toBe(why);
  });

  it("under another source's filter, Google Ads' figures don't apply", () => {
    const p = traffic({ filters: { ...filters, source: "organic_search" } });
    expect(p.quality.why).toBe("Google Ads' figures don't apply under this source filter.");
    expect(p.quality.dots).toEqual([]);
  });

  it("starts per row follow every filter, or are blank when they can't", () => {
    // Starts don't record the tier: every row's starts are blank, not all tiers' starts.
    const tier = traffic({ filters: { ...filters, tier: "tier_1" } });
    for (const table of ["channel", "campaign", "keyword"] as const) {
      for (const r of tier.breakdowns[table].rows) expect(r.counts.starts).toBeNull();
    }
  });

  it("ad spend that covers part of the range is never shown as the whole", () => {
    // GA4 begins on 3 Oct: the week's spend is partial.
    const late = { ...ad, from: "2026-10-03" };
    const p = traffic({ ad: late });
    expect(p.tiles.now.spend).toBeNull();
    expect(p.tiles.blocked.spend).toBe(
      "Ad spend is recorded from 3 Oct 2026: pick a range from that day on."
    );
    expect(p.breakdowns.channel.total!.counts.spend).toBeNull();
    expect(p.breakdowns.channel.notes).toContain(
      "Ad spend is recorded from 3 Oct 2026: pick a range from that day on."
    );
  });

  it("under another source's filter, Google's clicks and impressions are not shown", () => {
    const p = traffic({ filters: { ...filters, source: "organic_search" } });
    expect(p.tiles.now).toMatchObject({ clicks: null, impressions: null });
    expect(p.breakdowns.channel.total!.counts).toMatchObject({ clicks: null, impressions: null });
  });

  it("the landing test's visitor figures are blank under a filter visits can't follow", () => {
    const p = traffic({
      filters: { ...filters, from: "2026-10-14", to: "2026-10-14", device: "phone" },
      facts: factsFixture({ from: "2026-10-14", to: "2026-10-14" }),
      today: "2026-10-16",
    });
    const hero = p.experiments.arms.filter((a) => a.test === "Landing hero");
    for (const a of hero)
      expect(a).toMatchObject({ visitors: null, startCvr: null, revPerVisitor: null });
    expect(hero[1]!.why).toBe("Visits don't record the device.");
  });

  it("reads the price test without readers who paid before the survey (pay to start)", () => {
    // Pinned to A3 and paid with no report checkout: no arm's price decided that sale.
    const w = parseFilters({ period: "custom", from: "2026-10-09", to: "2026-10-12" }, TODAY);
    const paid = { paidAt: "2026-10-10T11:00:00Z", sales: 1, revenue: 29.99, plan: "full_report" };
    const p = traffic({
      filters: w,
      facts: factsFixture({
        from: "2026-10-09",
        to: "2026-10-12",
        subs: [
          sub({
            id: 1,
            day: "2026-10-10",
            priceArm: "A3",
            ...paid,
            checkoutAt: "2026-10-10T10:50:00Z",
          }),
          sub({ id: 2, day: "2026-10-10", priceArm: "A3" }),
          sub({ id: 3, day: "2026-10-10", priceArm: "A3", ...paid, checkoutAt: null }),
          sub({ id: 4, day: "2026-10-10", priceArm: "B3" }),
        ],
      }),
    });
    const a3 = p.experiments.arms.find((a) => a.test === "Pricing 3.0" && a.control)!;
    expect(a3).toMatchObject({ submissions: 2, paymentCvr: 0.5, revPerSub: 14.995 });
  });

  it("says exactly why survey starts are blank", () => {
    expect(traffic().tiles.blocked.starts).toBeNull();
    expect(traffic({ filters: { ...filters, tier: "tier_1" } }).tiles.blocked.starts).toBe(
      "Survey starts don't record the country tier."
    );
    const early = parseFilters({ period: "custom", from: "2026-09-01", to: "2026-09-07" }, TODAY);
    expect(
      traffic({ facts: factsFixture({ from: "2026-09-01", to: "2026-09-07" }), filters: early })
        .tiles.blocked.starts
    ).toBe("Survey starts before 18 Sep 2026 are incomplete once their drafts are cleared.");
  });

  it("the headline counts: spend, clicks, finishers and payers of the range", () => {
    const t = traffic().tiles.now;
    expect(t).toMatchObject({
      spend: 100,
      clicks: 50,
      impressions: 900,
      completes: 4,
      payers: 1,
    });
  });

  it("cohorts: revenue within N days of a person's first finished survey, among those old enough", () => {
    const first = "2026-07-01T10:00:00Z";
    const cohortFacts = factsFixture({
      from: "2026-07-01",
      to: "2026-07-07",
      subs: [
        sub({
          id: 1,
          day: "2026-07-01",
          at: first,
          userFirstAt: first,
          userPays: [
            // Within the first day, then within the first week.
            { at: "2026-07-01T12:00:00Z", amount: 9.99, plan: "full_report", refunded: false },
            { at: "2026-07-05T12:00:00Z", amount: 19.99, plan: "all_reports", refunded: false },
            // Refunded: never counted as revenue.
            { at: "2026-07-02T12:00:00Z", amount: 4.99, plan: "essentials", refunded: true },
          ],
        }),
      ],
    });
    const p = traffic({
      facts: cohortFacts,
      filters: parseFilters({ period: "custom", from: "2026-07-01", to: "2026-07-07" }, TODAY),
    });
    const google = p.cohorts.rows.find((r) => r.source === "Google Ads")!;
    // 13 Oct is 104 days on: old enough for every column.
    expect(google.rev).toEqual([9.99, 29.98, 29.98, 29.98]);
    expect(google.eligible).toEqual([1, 1, 1, 1]);
    expect(google.refund).toBeCloseTo(1 / 3);
    expect(google.crossSell).toBe(1);
  });
});
