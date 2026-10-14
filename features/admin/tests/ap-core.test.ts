import { describe, expect, it } from "vitest";

import { addDays, shortDate } from "@features/admin/server/ap/days";
import { classifySource, deviceClass, parseFacts } from "@features/admin/server/ap/facts";
import {
  activeNarrowing,
  comparisonRange,
  DATA_START,
  filterParams,
  filterSummary,
  grainOf,
  MAX_DAYS,
  parseFilters,
  periodRange,
  trendBuckets,
} from "@features/admin/server/ap/filters";
import { delta, fmt } from "@features/admin/server/ap/format";
import {
  ageMatched,
  ALL,
  armStartsComplete,
  draftsKeptFrom,
  sameAge,
  spendBlocked,
  startsComplete,
  totals,
  visitsBlocked,
} from "@features/admin/server/ap/metrics";

import { factsFixture, sub } from "./ap-fixtures";

const TODAY = "2026-10-13";

describe("AP days", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shortDate("2026-09-21")).toBe("21 Sep");
  });
});

describe("AP filters", () => {
  it("ends every preset yesterday, except Today", () => {
    expect(periodRange("30d", TODAY)).toEqual({ from: "2026-09-13", to: "2026-10-12" });
    expect(periodRange("7d", TODAY)).toEqual({ from: "2026-10-06", to: "2026-10-12" });
    expect(periodRange("today", TODAY)).toEqual({ from: TODAY, to: TODAY });
  });

  it("falls back to the defaults on anything malformed", () => {
    const f = parseFilters(
      { period: "nope", source: "x", device: "watch", tier: "tier_9", compare: "?" },
      TODAY
    );
    expect(parseFilters({ device: "tablet", source: "organic_search" }, TODAY)).toMatchObject({
      device: "tablet",
      source: "organic_search",
    });
    expect(f).toMatchObject({
      period: "30d",
      from: "2026-09-13",
      to: "2026-10-12",
      source: "all",
      device: "all",
      tier: "all",
      compare: "prev",
    });
  });

  it("clamps a custom range to the data, to today and to its maximum length", () => {
    expect(
      parseFilters({ period: "custom", from: "2025-01-01", to: "2026-05-01" }, TODAY)
    ).toMatchObject({ from: DATA_START, to: "2026-05-01" });
    expect(
      parseFilters({ period: "custom", from: "2026-10-01", to: "2026-12-01" }, TODAY)
    ).toMatchObject({ to: TODAY });
    expect(
      parseFilters({ period: "custom", from: "2026-10-10", to: "2026-10-01" }, TODAY)
    ).toMatchObject({ from: "2026-10-01", to: "2026-10-01" });
    const long = parseFilters(
      { period: "custom", from: DATA_START, to: "2027-06-01" },
      "2027-06-01"
    );
    expect(long.to).toBe("2027-06-01");
    expect(Math.round((Date.parse(long.to) - Date.parse(long.from)) / 86_400_000) + 1).toBe(
      MAX_DAYS
    );
    // An impossible date is not a date.
    expect(
      parseFilters({ period: "custom", from: "2026-02-30", to: "2026-10-10" }, TODAY).from
    ).toBe("2026-09-13");
  });

  it("compares with the period before, or the same dates a year earlier", () => {
    const f = parseFilters({}, TODAY);
    expect(comparisonRange(f)).toEqual({ from: "2026-08-14", to: "2026-09-12" });
    expect(comparisonRange({ ...f, compare: "yoy", from: "2028-02-29", to: "2028-03-01" })).toEqual(
      { from: "2027-02-28", to: "2027-03-01" }
    );
    expect(comparisonRange({ ...f, compare: "none" })).toBeNull();
  });

  it("draws days up to two weeks, weeks up to about four months, then months", () => {
    expect(grainOf("2026-10-01", "2026-10-14")).toBe("day");
    expect(grainOf("2026-10-01", "2026-10-15")).toBe("week");
    expect(grainOf("2026-06-01", "2026-10-04")).toBe("week");
    expect(grainOf("2026-06-01", "2026-10-05")).toBe("month");
  });

  it("leaves a week cut short by the range out of a trend line", () => {
    // 13 Sep (Sun) to 12 Oct (Mon): whole weeks are 14 Sep to 11 Oct.
    const b = trendBuckets("2026-09-13", "2026-10-12");
    expect(b.map((x) => x.from)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"]);
    expect(b.every((x) => x.full)).toBe(true);
  });

  it("marks a range that reaches today as running, and compares it with nothing", () => {
    const f = parseFilters({ period: "custom", from: "2026-10-10", to: TODAY }, TODAY);
    expect(f.running).toBe(true);
    expect(comparisonRange(f)).toBeNull();
    expect(comparisonRange({ ...f, compare: "yoy" })).toBeNull();
    expect(parseFilters({}, TODAY).running).toBe(false);
  });

  it("reads, writes and names the new/returning filter like the others", () => {
    const f = parseFilters({ visitor: "returning" }, TODAY);
    expect(f.visitor).toBe("returning");
    expect(parseFilters({ visitor: "everyone" }, TODAY).visitor).toBe("all");
    expect(filterParams(f)).toEqual({ visitor: "returning" });
    expect(filterParams(parseFilters({}, TODAY))).toEqual({});
    expect(filterSummary(f, TODAY)).toContain("Returning only");
    expect(activeNarrowing(f)).toEqual(["visitor"]);
  });

  it("says when the range is still running", () => {
    const f = parseFilters({ period: "today" }, TODAY);
    expect(filterSummary(f, TODAY)).toContain("(today so far)");
    expect(filterSummary(parseFilters({}, TODAY), TODAY)).not.toContain("today so far");
  });
});

describe("AP number format", () => {
  it("writes numbers as the design does", () => {
    expect(fmt("pct", 0.0596)).toBe("5.96%");
    expect(fmt("pct", 0.129)).toBe("12.9%");
    expect(fmt("eur", 1199)).toBe("€1,199");
    expect(fmt("eur", 29.5)).toBe("€29.50");
    expect(fmt("eur3", 0.0023)).toBe("€0.002");
    expect(fmt("mmss", 400_000)).toBe("6:40");
    expect(fmt("count", -3)).toBe("−3");
    expect(fmt("count", null)).toBe("—");
  });

  it("gives rates in points and calls a change under 1% flat", () => {
    expect(delta("pct", 0.07, 0.05)).toEqual({ text: "+2.00 pt", tone: "good" });
    expect(delta("count", 1005, 1000)?.tone).toBe("flat");
    expect(delta("eur", 90, 100, "down")).toEqual({ text: "−10.0%", tone: "good" });
    expect(delta("count", 5, 0)).toEqual({ text: "+5", tone: "good" });
    // Prices change in euros: cents on small sums, whole euros from €100.
    expect(delta("eur", 29, 32.25, "up", "abs")?.text).toBe("−€3.25");
    expect(delta("eur", 1169.39, 301.96, "down", "abs")).toEqual({ text: "+€867", tone: "bad" });
    expect(fmt("mmss", 5300)).toBe("5.3 s");
    // A check whose change is neither good nor bad (the report open rate) reads grey.
    expect(delta("pct", 0.94, 0.96, "either")).toEqual({ text: "−2.00 pt", tone: "flat" });
    expect(delta("count", 1, 4, "up", "abs")).toEqual({ text: "−3", tone: "bad" });
  });
});

describe("AP starts completeness", () => {
  it("keeps drafts for 30 days counted from today's sweep", () => {
    // The sweep took only the night-time drafts of 13 Sep: Last 30 days counts as kept.
    expect(draftsKeptFrom(TODAY)).toBe("2026-09-13");
    expect(startsComplete("2026-09-12", TODAY)).toBe(false);
    expect(startsComplete("2026-09-13", TODAY)).toBe(true);
    // Split by source, a start needs its draft whatever the date.
    expect(startsComplete("2026-09-20", "2026-11-01", { source: "google_ads" })).toBe(false);
    expect(startsComplete("2026-09-20", "2026-11-01")).toBe(true);
    // From 18 Sep the survey steps hold everyone, whatever the drafts.
    expect(startsComplete("2026-09-18", "2027-01-01")).toBe(true);
  });

  it("splits starts by landing arm only from 20 Sep 2026, and only while the drafts are kept", () => {
    expect(armStartsComplete("2026-09-19", TODAY)).toBe(false);
    expect(armStartsComplete("2026-09-20", TODAY)).toBe(true);
    expect(armStartsComplete("2026-10-01", "2026-11-05")).toBe(false);
    expect(armStartsComplete("2026-10-06", "2026-11-05")).toBe(true);
  });
});

describe("AP source classes", () => {
  const t = (src: string | null, med: string | null = null, ads = false) => ({ src, med, ads });
  it("reads a click id or google/cpc as Google Ads, and our probes as tests", () => {
    expect(classifySource(t(null, null, true))).toBe("google_ads");
    expect(classifySource(t("google", "cpc"))).toBe("google_ads");
    expect(classifySource(t("google", "organic"))).toBe("organic_search");
    expect(classifySource(t("chatgpt.com"))).toBe("ai");
    expect(classifySource(t("email"))).toBe("email");
    expect(classifySource(t("x", "nurture"))).toBe("email");
    expect(classifySource(t("ig"))).toBe("social");
    expect(classifySource(t("prod-verification"))).toBe("test");
    expect(classifySource(t("anything", "probe"))).toBe("test");
    expect(classifySource(t(null))).toBe("direct");
    expect(classifySource(t("google"), false)).toBe("unknown");
    expect(deviceClass("iOS")).toBe("phone");
    expect(deviceClass("Desktop")).toBe("computer");
    expect(deviceClass("Tablet")).toBe("tablet");
    expect(deviceClass(null)).toBeNull();
  });

  it("reads Meta Ads only when tagged paid, and organic search by tag or by referrer", () => {
    const t = (
      src: string | null,
      med: string | null = null,
      more: { ref?: string; fb?: boolean; ads?: boolean } = {}
    ) => ({ src, med, ads: false, ...more });
    expect(classifySource(t("facebook", "paid"))).toBe("meta_ads");
    expect(classifySource(t("ig", "paid_social"))).toBe("meta_ads");
    expect(classifySource(t("an", "cpm"))).toBe("meta_ads");
    // Meta adds its click id to ordinary link clicks too: alone it is Social.
    expect(classifySource(t("facebook", null, { fb: true }))).toBe("social");
    expect(classifySource(t(null, null, { fb: true }))).toBe("social");
    expect(classifySource(t(null, null, { fb: true, ref: "l.facebook.com" }))).toBe("social");
    expect(classifySource(t("bing", "organic"))).toBe("organic_search");
    for (const ref of [
      "www.google.com",
      "www.google.de",
      "www.google.co.uk",
      "google.com.br",
      "com.google.android.googlequicksearchbox",
      "www.bing.com",
      "duckduckgo.com",
      "de.search.yahoo.com",
      "www.ecosia.org",
      "yandex.ru",
      "search.brave.com",
    ]) {
      expect(classifySource(t(null, null, { ref })), ref).toBe("organic_search");
    }
    // Not a search: Gmail's own page, another site, or a visit that carries tags.
    expect(classifySource(t(null, null, { ref: "mail.google.com" }))).toBe("direct");
    expect(classifySource(t(null, null, { ref: "www.reddit.com" }))).toBe("direct");
    expect(classifySource(t("newsletter", "email", { ref: "www.google.com" }))).toBe("email");
    expect(classifySource(t("google", "cpc", { ref: "www.google.com" }))).toBe("google_ads");
    expect(classifySource(t("google", "organic", { fb: true }))).toBe("social");
    // Our own probes are never counted, whatever click id they carry.
    expect(classifySource(t("anything", "probe", { ads: true }))).toBe("test");
  });
});

describe("AP totals", () => {
  it("counts visits, starts, finishers and money, and never our probes", () => {
    const t = totals(factsFixture(), ALL);
    expect(t.visits).toBe(220);
    expect(t.starts).toBe(14);
    expect(t.subs).toBe(2);
    expect(t.paidCohort).toBe(1);
    expect(t.revenue).toBe(6.99);
    expect(t.sales).toBe(1);
    expect(t.gifts).toBe(1);
  });

  it("blanks what a filter cannot split rather than ignoring the filter", () => {
    const t = totals(factsFixture(), { ...ALL, source: "google_ads" });
    expect(t.visits).toBeNull();
    // The unknown start (no tracker) never matches a source.
    expect(t.starts).toBe(10);
    expect(totals(factsFixture(), { ...ALL, tier: "tier_1" }).starts).toBeNull();
    expect(totals(factsFixture(), { ...ALL, assessment: "b" }).subs).toBe(0);
  });

  it("splits finishers and payments by new or returning, and blanks what has no visit history", () => {
    const facts = factsFixture();
    const [first, second] = facts.subs;
    first!.visitorNew = true;
    second!.visitorNew = false;
    for (const m of facts.money) m.visitorNew = m.sid === first!.id;
    const n = totals(facts, { ...ALL, visitor: "new" });
    const r = totals(facts, { ...ALL, visitor: "returning" });
    expect(n.subs + r.subs).toBe(totals(facts, ALL).subs);
    expect(n.subs).toBe(1);
    expect(n.visits).toBeNull();
    expect(n.starts).toBeNull();
    expect(visitsBlocked({ ...ALL, visitor: "new" })).toMatch(/new and returning/);
    expect(spendBlocked({ ...ALL, visitor: "returning" })).toMatch(/new and returning/);
    // Not marked (PostHog never saw the visit): in neither group.
    second!.visitorNew = null;
    expect(totals(facts, { ...ALL, visitor: "returning" }).subs).toBe(0);
  });

  it("blanks starts split by source once the drafts that carried the source are gone", () => {
    // 1 to 7 Oct, read on 20 Nov: drafts are kept from 21 Oct only.
    const late = factsFixture({ asOf: "2026-11-20" });
    expect(totals(late, { ...ALL, source: "google_ads" }).starts).toBeNull();
    // All sources together: the survey steps hold every start from 18 Sep.
    expect(totals(late, ALL).starts).toBe(14);
    expect(totals(factsFixture(), { ...ALL, source: "google_ads" }).starts).toBe(10);
  });

  it("splits by tablet only from the tracking day, and by the referrer the tracker kept", () => {
    // 13 to 14 Oct: steps carry the device, but tablets are not told apart until the 15th.
    const oct13 = factsFixture({ from: "2026-10-13", to: "2026-10-14" });
    expect(totals(oct13, { ...ALL, device: "tablet" }).starts).toBeNull();
    expect(totals(oct13, { ...ALL, device: "phone" }).starts).not.toBeNull();
    const later = factsFixture({
      from: "2026-10-15",
      to: "2026-10-16",
      starts: [
        {
          day: "2026-10-15",
          known: true,
          src: null,
          med: null,
          ads: false,
          ref: "www.google.com",
          arm: null,
          device: "Tablet",
          finished: true,
          n: 2,
        },
      ],
      subs: [sub({ day: "2026-10-15", src: null, med: null, ads: false, ref: "www.google.com" })],
      money: [],
    });
    expect(totals(later, { ...ALL, device: "tablet" })).toMatchObject({ starts: 2, subs: 0 });
    expect(totals(later, { ...ALL, device: "phone" })).toMatchObject({ starts: 0, subs: 1 });
    expect(totals(later, { ...ALL, source: "organic_search" })).toMatchObject({
      starts: 2,
      subs: 1,
    });
    const raw = {
      visits: [],
      starts: [{ day: "2026-10-15", known: true, ref: "www.bing.com", fb: true, n: 1 }],
      subs: [],
      money: [],
      intro: [],
      invites: [],
      quotes: [],
    };
    expect(parseFacts(raw, "2026-10-15", "2026-10-15").starts[0]).toMatchObject({
      ref: "www.bing.com",
      fb: true,
    });
  });

  it("reads the facts as PostgREST and a SQL client both return them", () => {
    const raw = {
      visits: [{ day: "2026-10-01", arm: "white", src: null, n: "3" }],
      starts: [],
      subs: [],
      money: [],
      intro: [],
      invites: [],
      quotes: [],
    };
    expect(parseFacts(raw, "2026-10-01", "2026-10-01").visits[0]?.n).toBe(3);
    expect(parseFacts(raw, "2026-10-01", "2026-10-01", "2026-10-13").asOf).toBe("2026-10-13");
    expect(parseFacts([{ ap_facts: raw }], "2026-10-01", "2026-10-01").visits[0]?.n).toBe(3);
  });

  it("reads each intro step's times and skips, and none from a function without them", () => {
    const raw = {
      visits: [],
      starts: [],
      subs: [],
      money: [],
      intro: [
        {
          day: "2026-10-01",
          step: "intro_slide_1",
          n: "3",
          ms: [4100, "5200"],
          skipped: "1",
          wentOn: "2",
          left: 1,
        },
        { day: "2026-10-01", step: "intro_slide_2", n: 2 },
      ],
      invites: [],
      quotes: [],
    };
    expect(parseFacts(raw, "2026-10-01", "2026-10-01").intro).toEqual([
      {
        day: "2026-10-01",
        step: "intro_slide_1",
        n: 3,
        ms: [4100, 5200],
        skipped: 1,
        wentOn: 2,
        left: 1,
      },
      // Without them: unknown, never a zero continue or exit.
      {
        day: "2026-10-01",
        step: "intro_slide_2",
        n: 2,
        ms: [],
        skipped: 0,
        wentOn: null,
        left: null,
      },
    ]);
  });
});

describe("AP same-age comparisons", () => {
  it("reads an earlier period only up to the age the current one has", () => {
    // This week began 7 days after the last: the last is read up to 7 days before now.
    expect(
      sameAge({ from: "2026-10-08" }, { from: "2026-10-01" }, new Date("2026-10-13T10:00:00Z"))
    ).toEqual(new Date("2026-10-06T10:00:00Z"));

    const prev = factsFixture({
      subs: [
        sub({
          openedAt: "2026-10-01T10:05:00Z",
          returnedAt: "2026-10-09T08:00:00Z",
          visits: 3,
          paidAt: "2026-10-08T00:00:00Z",
          sales: 1,
          revenue: 6.99,
          shared: true,
          sharedAt: "2026-10-03T00:00:00Z",
          votes: 2,
          votedAt: "2026-10-07T00:00:00Z",
          invited: true,
          invitedAt: "2026-10-02T00:00:00Z",
        }),
      ],
    });
    const aged = ageMatched(prev, new Date("2026-10-06T10:00:00Z")).subs[0];
    expect(aged).toMatchObject({
      openedAt: "2026-10-01T10:05:00Z",
      returnedAt: null,
      visits: 1,
      paidAt: null,
      sales: 0,
      revenue: 0,
      shared: true,
      votes: 0,
      votedAt: null,
      invited: true,
    });
    const t = totals({ ...prev, subs: [aged!] }, ALL);
    expect(t).toMatchObject({ paidCohort: 0, sharers: 1, raters: 0, inviters: 1 });
  });
});
