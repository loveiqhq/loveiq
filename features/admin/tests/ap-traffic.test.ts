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

  // Marcus, 15 Oct: each keyword's ad as searchers see it, with what its clicks brought.
  it("ads as searchers see them: the keyword's row with its ad, by spend; why when blank", () => {
    const preview = {
      headlines: ["Am I Normal?", "Take The Test", "LoveIQ"],
      descriptions: ["Discover your sexual archetype."],
      display: "www.loveiq.org/Test",
    };
    const withAd: AdsResult = {
      ok: true,
      value: { ...ads.value!, keywords: [{ ...ads.value!.keywords[0]!, ad: preview }] },
    } as AdsResult;
    const p = traffic({ ads: withAd });
    expect(p.adsSeen.why).toBeNull();
    expect(p.adsSeen.rows).toEqual([
      expect.objectContaining({
        key: "price_time_test|love test",
        keyword: "love test",
        campaign: "Price + Time Test",
        ad: preview,
      }),
    ]);
    // The Performance table's own counts for the keyword: its spend, finishers and payers.
    expect(p.adsSeen.rows[0]!.counts).toMatchObject({ spend: 20, completes: 2, payers: 1 });
    // The keyword's ad group has no search ad: no card, and why.
    const none = traffic({
      ads: {
        ok: true,
        value: { ...ads.value!, keywords: [{ ...ads.value!.keywords[0]!, ad: null }] },
      } as AdsResult,
    });
    expect(none.adsSeen).toEqual({
      rows: [],
      why: "No keyword with a search ad had clicks or finishers in this range.",
    });
    // The search ads weren't read (no ad at all): say so, never "none".
    expect(traffic().adsSeen.why).toBe("Google Ads' search ads could not be read just now.");
    // Another source's filter: Google Ads' keywords don't apply.
    expect(
      traffic({ ads: withAd, filters: { ...filters, source: "organic_search" } }).adsSeen.rows
    ).toEqual([]);
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
    const why =
      "Ad spend isn't split by device in these figures: Google's own split is on Traffic, under Performance › Device, with no device filter on.";
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
    expect(p.quality).toEqual({ dots: [], why, note: null });
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
        // Finished after the test's restart (8 Oct 17:23), as its readers must be.
        subs: [
          sub({
            id: 1,
            day: "2026-10-10",
            at: "2026-10-10T10:40:00Z",
            priceArm: "A3",
            ...paid,
            checkoutAt: "2026-10-10T10:50:00Z",
          }),
          sub({ id: 2, day: "2026-10-10", at: "2026-10-10T10:40:00Z", priceArm: "A3" }),
          sub({
            id: 3,
            day: "2026-10-10",
            at: "2026-10-10T10:40:00Z",
            priceArm: "A3",
            ...paid,
            checkoutAt: null,
          }),
          sub({ id: 4, day: "2026-10-10", at: "2026-10-10T10:40:00Z", priceArm: "B3" }),
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

  it("visitors: Google Ads' counted by the visit log, the untagged split, devices split per source", () => {
    const tag = { med: null, fb: false, ref: null } as const;
    const withLog = factsFixture({
      ...facts,
      visits: [
        // The visit log keeps the link's utm_source: Google Ads' template tags every click.
        { day: "2026-10-02", arm: "white_card", src: "google", n: 50 },
        { day: "2026-10-02", arm: "white_card", src: null, n: 100 },
        { day: "2026-10-03", arm: "white_card", src: "prod-verification", n: 5 },
      ],
      subs: [
        ...facts.subs,
        // Finished before sources were recorded, untagged: its own row, never Direct.
        sub({ id: 9, src: null, med: null, ads: false, srcKnown: false, camp: null, term: null }),
      ],
    });
    const g = (over: Record<string, unknown>, sessions: number) => ({
      bucket: "2026-10-02",
      src: null,
      ads: false,
      camp: null,
      term: null,
      sessions,
      ...tag,
      ...over,
    });
    const sessions = {
      ok: true as const,
      value: [
        // PostHog sees nearly every Google Ads visit: its split of them names the campaigns.
        g({ src: "google", med: "cpc", ads: true, camp: "price_time_test" }, 30),
        g({ src: "google", med: "cpc", ads: true, camp: "performance_max" }, 10),
        // The untagged it saw: 20 direct, 5 from a search engine.
        g({}, 20),
        g({ ref: "www.google.com" }, 5),
      ],
    };
    const v = (dim: "device", value: string, over: Record<string, unknown>, n: number) => ({
      dim,
      value,
      src: null,
      ads: false,
      sessions: n,
      ...tag,
      ...over,
    });
    const google = { src: "google", med: "cpc", ads: true };
    const audience = {
      ok: true as const,
      value: [
        v("device", "Mobile", google, 30),
        v("device", "Desktop", google, 10),
        v("device", "Mobile", {}, 5),
        v("device", "Desktop", {}, 15),
        v("device", "Mobile", { ref: "www.google.com" }, 5),
      ],
    };
    const p = traffic({ facts: withLog, sessions, audience });
    const row = (k: keyof typeof p.breakdowns, key: string) =>
      p.breakdowns[k].rows.find((r) => r.key === key)!;
    // 50 counted, never PostHog's 62% share of all its visits (40 of 65) times 150.
    expect(row("channel", "google_ads").counts.visitors).toBe(50);
    expect(row("campaign", "price_time_test").counts.visitors).toBe(38);
    // The 100 untagged: direct 4 in 5, organic search 1 in 5. Organic and Direct rates are
    // blank before 17 Oct (our own records tell them apart only from then), so read the split.
    expect(p.attribution).toMatchObject({ unattributed: { n: 80, of: 150 } });
    // Each source's visitors by its own devices: Google Ads 3 in 4 mobile, Direct 1 in 4,
    // organic all: 37.5 + 20 + 20 mobile, not 62% of 150.
    expect(row("device", "phone").counts.visitors).toBe(78);
    expect(row("device", "computer").counts.visitors).toBe(73);
    expect(row("channel", "unknown")).toMatchObject({
      name: "Not recorded",
      counts: { completes: 1 },
    });
  });

  it("visitors: Google Ads' count needs no PostHog, its campaigns add up, tablets aren't divided", () => {
    const tag = { med: null, fb: false, ref: null } as const;
    const withLog = factsFixture({
      ...facts,
      visits: [
        { day: "2026-10-02", arm: "white_card", src: "google", n: 50 },
        { day: "2026-10-02", arm: "white_card", src: null, n: 100 },
      ],
      subs: [...facts.subs, sub({ id: 7, device: "Tablet" })],
    });
    const g = (over: Record<string, unknown>, sessions: number) => ({
      bucket: "2026-10-02",
      src: "google",
      med: "cpc",
      ads: true,
      camp: null,
      term: null,
      sessions,
      ...tag,
      ...over,
    });
    const sessions = {
      ok: true as const,
      value: [
        g({ camp: "price_time_test" }, 30),
        g({ camp: "performance_max" }, 8),
        // An old campaign's link, still clicked: no Ads line and no finisher, but visitors.
        g({ camp: "loveiq_problem_awareness" }, 2),
        g({ src: null, med: null, ads: false }, 20),
      ],
    };
    const row = (p: ReturnType<typeof traffic>, k: keyof typeof p.breakdowns, key: string) =>
      p.breakdowns[k].rows.find((r) => r.key === key);
    const p = traffic({ facts: withLog, sessions });
    // Every campaign tag PostHog saw has its row, so the rows add up to Google Ads' 50.
    // 50 × 2/40 = 2.5: whole visitors that add up, so 2 here and 38 for 37.5, never 51 of 50.
    expect(row(p, "campaign", "loveiq_problem_awareness")!.counts.visitors).toBe(2);
    expect(row(p, "campaign", "price_time_test")!.counts.visitors).toBe(38);
    expect(p.breakdowns.campaign.rows.reduce((a, r) => a + (r.counts.visitors ?? 0), 0)).toBe(
      p.breakdowns.campaign.total!.counts.visitors
    );
    // PostHog calls an iPad a desktop: the survey's tablets are never divided by its tablets.
    expect(row(p, "device", "tablet")!.counts.visitors).toBeNull();
    expect(row(p, "device", "tablet")!.sub).toBe(
      "PostHog counts iPads as Desktop, so tablet visitors aren't counted"
    );
    // PostHog unread: Google Ads' visitors are still the visit log's count, the rest blank.
    const unread = traffic({ facts: withLog, sessions: null });
    expect(row(unread, "channel", "google_ads")!.counts.visitors).toBe(50);
    expect(row(unread, "channel", "direct")!.counts.visitors).toBeNull();
    // Under the Google Ads filter: its row alone, counted, and its campaigns split.
    const ga = traffic({
      facts: withLog,
      sessions,
      filters: parseFilters(
        { period: "custom", from: "2026-10-01", to: "2026-10-07", source: "google_ads" },
        TODAY
      ),
    });
    expect(ga.breakdowns.channel.rows.map((r) => [r.key, r.counts.visitors])).toEqual([
      ["google_ads", 50],
    ]);
    expect(row(ga, "campaign", "price_time_test")!.counts.visitors).toBe(38);
  });

  it("a filter the records can't follow blanks every table about people, never zeros", () => {
    // New or returning before finished surveys kept their PostHog visit (28 Aug 2026).
    const early = factsFixture({ ...facts, from: "2026-08-01", to: "2026-08-07" });
    const p = traffic({
      facts: early,
      filters: parseFilters(
        { period: "custom", from: "2026-08-01", to: "2026-08-07", visitor: "new" },
        TODAY
      ),
    });
    const why = p.tiles.blocked.people!;
    expect(why).toMatch(/^New and returning are told apart from 28 Aug 2026/);
    for (const k of [
      "channel",
      "campaign",
      "keyword",
      "landing",
      "device",
      "tier",
      "visitor",
    ] as const)
      expect(p.breakdowns[k].blocked).toBe(why);
    expect(p.trend.submissionsWhy).toBe(why);
    expect(p.experiments).toMatchObject({ arms: [], why });
    expect(p.quality).toMatchObject({ dots: [], why });
    expect(p.audience.dims.filter((d) => d.kind === "survey").every((d) => d.blocked === why)).toBe(
      true
    );
  });

  it("keywords: a link's utm_term is the keyword only from 27 Aug 2026 (before, the ad group's name)", () => {
    const may = factsFixture({
      ...facts,
      from: "2026-08-20",
      to: "2026-08-30",
      subs: [
        sub({ id: 1, day: "2026-08-21", camp: "loveiq_problem_awareness", term: "am i normal" }),
        sub({ id: 2, day: "2026-08-28", camp: "price_time_test", term: "love test" }),
      ],
    });
    const p = traffic({
      facts: may,
      filters: parseFilters({ period: "custom", from: "2026-08-20", to: "2026-08-30" }, TODAY),
    });
    const names = p.breakdowns.keyword.rows.map((r) => r.name);
    expect(names).toContain("love test");
    expect(names).not.toContain("am i normal");
    expect(p.breakdowns.keyword.notes.join(" ")).toMatch(
      /The links pass the keyword from 27 Aug 2026/
    );
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

  it("under Free survey with the report's €1.99 gate off and none sold, blanks the pre-unlock columns, with why", () => {
    const subsFacts = factsFixture({
      from: "2026-10-24",
      to: "2026-10-30",
      subs: [sub({ id: 1, day: "2026-10-25", at: "2026-10-25T10:00:00Z" })],
    });
    const at = (gateOn: boolean | null) =>
      traffic({
        facts: subsFacts,
        filters: parseFilters(
          { period: "custom", from: "2026-10-24", to: "2026-10-30", funnel: "free" },
          TODAY
        ),
        gateOn,
      });
    const off = at(false);
    const why = "Not sold in the free survey: the report's €1.99 gate is switched off.";
    for (const t of Object.values(off.breakdowns)) {
      for (const r of t.rows) expect(r.counts.prePayers).toBeNull();
      expect(t.notes).toContain(why);
    }
    // With the gate on, the free survey's 0 is a real 0.
    const on = at(true);
    expect(
      Object.values(on.breakdowns).some((t) => t.rows.some((r) => r.counts.prePayers === 0))
    ).toBe(true);
  });

  it("cohorts under Free survey: a person's sale on a pay-to-start survey is not the free funnel's", () => {
    const first = "2026-07-01T10:00:00Z";
    const facts = factsFixture({
      from: "2026-07-01",
      to: "2026-07-07",
      subs: [
        sub({
          id: 1,
          day: "2026-07-01",
          at: first,
          userFirstAt: first,
          userPays: [
            { at: "2026-07-01T12:00:00Z", amount: 9.99, plan: "full_report", refunded: false },
            // Bought on a later survey they paid for before taking it.
            {
              at: "2026-07-03T12:00:00Z",
              amount: 29.99,
              plan: "full_report",
              refunded: false,
              pts: true,
            },
          ],
        }),
      ],
    });
    const rev = (funnel: string) =>
      traffic({
        facts,
        filters: parseFilters(
          { period: "custom", from: "2026-07-01", to: "2026-07-07", funnel },
          TODAY
        ),
      }).cohorts.rows.find((r) => r.source === "Google Ads")!.rev;
    expect(rev("all")).toEqual([9.99, 39.98, 39.98, 39.98]);
    expect(rev("free")).toEqual([9.99, 9.99, 9.99, 9.99]);
  });
});
