// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockHogql = vi.fn();
vi.mock("@features/ux-review/server/review", () => ({
  hogqlTable: (...args: unknown[]) => mockHogql(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// The screen test draws a payload the builder made, without the network or the URL.
const screenData = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({
    data: screenData.payload,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
vi.mock("@features/admin/ui/ap/ApOverview", () => ({ RangeLine: () => null }));

import { addDays } from "@features/admin/server/ap/days";
import { parseFilters, rangeLabel } from "@features/admin/server/ap/filters";
import {
  buildLanding,
  engagementWindows,
  LANDING_TESTS,
  rateVerdict,
  revenueVerdict,
  testWindow,
  timeVerdict,
  type ArmRow,
} from "@features/admin/server/ap/landing";
import {
  fetchLandingEngagement,
  fetchLandingSectionTime,
  fetchLandingTime,
  SECTION_TIME_FROM,
  type LandingArmEngagement,
} from "@features/admin/server/ap/posthog";
import ApLanding from "@features/admin/ui/ap/ApLanding";
import {
  LANDING_HERO_VIDEO_LAUNCH_DAY,
  LANDING_TEST_START_DAY,
} from "@shared/experiments/landingVariant";

import { factsFixture, sub } from "./ap-fixtures";

/**
 * PostHog's engagement for one arm: `sessions` visits, `bounced` of them bounced, one timed
 * view each, averaging 8 s (9 s for the video) with a variance of 100 (10 s either way).
 */
const ph = (arm: string, sessions: number, bounced: number): LandingArmEngagement => {
  const mean = arm === "white_video" ? 9 : 8;
  return {
    arm,
    sessions,
    bounced,
    cta: 0,
    leaves: sessions,
    scroll: [sessions, 0, 0, 0],
    medianSeconds: 5,
    meanSeconds: mean,
    timed: sessions,
    sqSeconds: sessions * (100 + mean ** 2),
  };
};

const test = (key: string) => LANDING_TESTS.find((t) => t.key === key)!;

describe("landing test windows", () => {
  it("runs a live test to yesterday and clips every test to the range", () => {
    expect(testWindow(test("hero"), "2026-10-01", "2026-12-31", "2026-11-01")).toEqual({
      from: LANDING_TEST_START_DAY,
      to: "2026-10-31",
    });
    expect(testWindow(test("rebuild"), "2026-09-13", "2026-10-12", "2026-10-13")).toEqual({
      from: "2026-09-13",
      to: "2026-09-19",
    });
    expect(testWindow(test("rebuild"), "2026-10-01", "2026-10-12", "2026-10-13")).toBeNull();
    // V1's visits carry their version from 25 Aug: the days before are not the test's.
    expect(testWindow(test("rebuild"), "2026-08-01", "2026-08-31", "2026-10-13")).toEqual({
      from: "2026-08-25",
      to: "2026-08-31",
    });
  });

  it("reads PostHog per arm only for the round-3 runs", () => {
    const keys = engagementWindows("2026-08-01", "2026-10-31", "2026-11-01").map((w) => w.key);
    expect(keys).toEqual(["hero", "hero-first-run"]);
    expect(test("hero-first-run").from).toBe(LANDING_HERO_VIDEO_LAUNCH_DAY);
  });
});

describe("landing verdicts", () => {
  it("refuses to call too small a test, as the team's readouts refuse", () => {
    expect(rateVerdict(3, 20, 4, 20)).toBe("Too few to call");
    // Under 5 of an outcome in one arm.
    expect(rateVerdict(4, 400, 30, 400)).toBe("Too few to call");
    expect(rateVerdict(4, 400, 30, 400, false, "Too few payments to call")).toBe(
      "Too few payments to call"
    );
  });

  it("gives the chance that B (or A) is better, and turns for lower-is-better", () => {
    expect(rateVerdict(80, 1000, 50, 1000)).toMatch(/chance A is better$/);
    expect(rateVerdict(80, 1000, 50, 1000, true)).toMatch(/chance B is better$/);
    expect(rateVerdict(100, 1000, 101, 1000)).toBe("53% chance B is better");
  });

  it("calls revenue only with enough payers", () => {
    const row = (paid: number, revenue: number, visits: number): ArmRow =>
      ({ paid, revenue, revenueSq: paid * (revenue / Math.max(paid, 1)) ** 2, visits }) as ArmRow;
    expect(revenueVerdict(row(2, 14, 1000), row(9, 63, 1000))).toBe("Too few payments to call");
    expect(revenueVerdict(row(0, 0, 0), row(9, 63, 1000))).toBe("Too few to call");
    // Never "100%": a sample never makes it certain.
    expect(rateVerdict(50, 1000, 80, 1000)).toBe("99% chance B is better");
    expect(revenueVerdict(row(10, 70, 1000), row(30, 210, 1000))).toMatch(/chance B is better$/);
  });
});

describe("buildLanding", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const filters = parseFilters(
    { period: "custom", from: "2026-10-01", to: "2026-10-07" },
    "2026-10-13"
  );

  it("counts each arm's visits, starts and people inside the test's own days, without probes", () => {
    const facts = factsFixture({
      visits: [
        { day: "2026-10-06", arm: "white_card", src: null, n: 50 },
        { day: "2026-10-07", arm: "white_card", src: null, n: 100 },
        { day: "2026-10-07", arm: "white_video", src: null, n: 120 },
        { day: "2026-10-07", arm: "white_card", src: "prod-verification", n: 7 },
        { day: "2026-10-07", arm: "unknown", src: null, n: 30 },
      ],
      starts: [
        {
          day: "2026-10-07",
          known: true,
          src: "google",
          med: "cpc",
          ads: true,
          arm: "white_card",
          device: "iOS",
          finished: true,
          n: 12,
        },
        {
          day: "2026-10-07",
          known: true,
          src: "prod-verification",
          med: null,
          ads: false,
          arm: "white_card",
          device: null,
          finished: true,
          n: 2,
        },
        {
          day: "2026-10-07",
          known: true,
          src: null,
          med: null,
          ads: false,
          arm: "white_video",
          device: null,
          finished: false,
          n: 18,
        },
      ],
      subs: [
        sub({
          id: 1,
          day: "2026-10-07",
          arm: "white_card",
          paidAt: "2026-10-08T00:00:00Z",
          sales: 1,
          revenue: 6.99,
        }),
        sub({
          id: 2,
          day: "2026-10-07",
          arm: "white_card",
          src: "prod-verification",
          med: null,
          ads: false,
        }),
        sub({ id: 3, day: "2026-10-06", arm: "white_card" }),
      ],
    });
    const p = buildLanding({
      facts,
      filters,
      today: "2026-10-13",
      now,
      armEngagement: {},
      engagement: null,
      sections: null,
    });
    const [a, b] = p.rows;
    expect(p.rows).toHaveLength(2);
    expect(a).toMatchObject({
      testKey: "hero-first-run",
      arm: "white_card",
      from: "2026-10-07",
      to: "2026-10-07",
      visits: 100,
      starts: 12,
      subs: 1,
      paid: 1,
      revenue: 6.99,
      status: "Ended",
    });
    expect(b).toMatchObject({ arm: "white_video", visits: 120, starts: 18, subs: 0 });
    expect(a?.startCvr).toBeCloseTo(0.12);
    expect(a?.bounce).toBeNull();
    expect(p.compare).toBeNull();
    expect(p.outside.map((o) => o.split(" (")[0])).toEqual([
      "Hero: video vs question 1",
      "Landing rebuild: V1 vs V2",
    ]);
    // 12 of 100 against 18 of 120: enough to read, far from sure.
    expect(p.comparisons[0]?.metrics[0]?.verdict).toBe("74% chance B is better");
    expect(p.comparisons[0]?.metrics[2]?.verdict).toBe("Too few payments to call");
  });

  it("reads an ended test as its decision, keeping the chance after it", () => {
    const facts = factsFixture({
      from: "2026-09-13",
      to: "2026-09-19",
      visits: [
        { day: "2026-09-15", arm: "white_prev", src: null, n: 400 },
        { day: "2026-09-15", arm: "white", src: null, n: 500 },
      ],
      starts: [],
      subs: [
        ...Array.from({ length: 20 }, (_, i) =>
          sub({ id: 100 + i, day: "2026-09-15", at: "2026-09-15T10:00:00Z", arm: "white_prev" })
        ),
        ...Array.from({ length: 30 }, (_, i) =>
          sub({ id: 200 + i, day: "2026-09-15", at: "2026-09-15T10:00:00Z", arm: "white" })
        ),
      ],
    });
    const p = buildLanding({
      facts,
      filters: parseFilters(
        { period: "custom", from: "2026-09-13", to: "2026-09-19" },
        "2026-10-13"
      ),
      today: "2026-10-13",
      now,
      armEngagement: {},
      engagement: null,
      sections: null,
    });
    const verdicts = p.comparisons[0]!.metrics.map((m) => m.verdict);
    // V2 (B) was kept: a chance reading leads with the decision, a caveat stays as it is.
    expect(verdicts[1]).toMatch(/^Ended · B kept · \d+% chance [AB] is better$/);
    expect(verdicts[0]).toBe("Not recorded for these days: see the note under the tests");
    // The hero test has no winner yet: its chances read plain.
    expect(LANDING_TESTS.find((t) => t.key === "hero")!.winner).toBeUndefined();
  });

  it("leaves start CVR blank where starts by arm are not kept, and takes bounce from PostHog's sample", () => {
    const facts = factsFixture({
      from: "2026-09-13",
      to: "2026-09-19",
      visits: [
        { day: "2026-09-15", arm: "white_prev", src: null, n: 400 },
        { day: "2026-09-15", arm: "white", src: null, n: 500 },
      ],
      starts: [],
      subs: [],
    });
    const f = parseFilters(
      { period: "custom", from: "2026-09-13", to: "2026-09-19" },
      "2026-10-13"
    );
    const p = buildLanding({
      facts,
      filters: f,
      today: "2026-10-13",
      now,
      armEngagement: {},
      engagement: null,
      sections: null,
    });
    expect(p.rows.map((r) => [r.arm, r.status, r.startCvr])).toEqual([
      ["white_prev", "Ended", null],
      ["white", "Winner", null],
    ]);
    expect(p.comparisons[0]?.metrics[0]?.verdict).toBe(
      "Not recorded for these days: see the note under the tests"
    );
    expect(p.comparisons[0]?.metrics[4]?.verdict).toBe(
      "Before 7 Oct 2026 PostHog did not reliably know which version a visitor saw"
    );

    const live = factsFixture({
      from: "2026-10-14",
      to: "2026-10-20",
      visits: [],
      starts: [],
      subs: [],
    });
    const lf = parseFilters(
      { period: "custom", from: "2026-10-14", to: "2026-10-20" },
      "2026-10-21"
    );
    const q = buildLanding({
      facts: live,
      filters: lf,
      today: "2026-10-21",
      now,
      armEngagement: {
        hero: { ok: true, value: [ph("white_card", 200, 80), ph("white_video", 20, 5)] },
      },
      engagement: { ok: true, value: [ph("white_card", 200, 80), ph("white_video", 20, 5)] },
      sections: { ok: true, value: null },
    });
    expect(q.rows.map((r) => [r.arm, r.status, r.bounce])).toEqual([
      ["white_card", "Running", 0.4],
      // Under 30 PostHog visits in an arm: no bounce.
      ["white_video", "Running", null],
    ]);
    expect(q.engagement).toMatchObject({ ok: true, value: { sessions: 220, bounce: 85 / 220 } });
    // Medians don't add up across versions: the page's own, or none, never one version's.
    expect(q.engagement?.ok && q.engagement.value.medianSeconds).toBeNull();
    expect(q.engagement?.ok && q.engagement.value.meanSeconds).toBeNull();
    const withMedian = buildLanding({
      facts: live,
      filters: lf,
      today: "2026-10-21",
      now,
      armEngagement: {},
      engagement: { ok: true, value: [ph("white_card", 200, 80), ph("white_video", 20, 5)] },
      pageTime: { ok: true, value: { median: 7.25, mean: 11.5 } },
      sections: null,
    });
    expect(withMedian.engagement).toMatchObject({
      ok: true,
      value: { medianSeconds: 7.25, meanSeconds: 11.5 },
    });
    expect(q.rows.map((r) => r.testShort)).toEqual([
      "#6 · Hero video vs Q1",
      "#6 · Hero video vs Q1",
    ]);
    expect(q.sections).toEqual({ ok: true, value: null });
  });
});

/** A running hero test from 14 Oct with PostHog's time and each section's, as the route reads them. */
function livePayload(over: Partial<Parameters<typeof buildLanding>[0]> = {}) {
  const arms = [ph("white_card", 200, 80), ph("white_video", 120, 30)];
  return buildLanding({
    facts: factsFixture({ from: "2026-10-14", to: "2026-10-20", visits: [], starts: [], subs: [] }),
    filters: parseFilters({ period: "custom", from: "2026-10-14", to: "2026-10-20" }, "2026-10-21"),
    today: "2026-10-21",
    now: new Date("2026-10-21T12:00:00Z"),
    armEngagement: { hero: { ok: true, value: arms } },
    engagement: { ok: true, value: arms },
    pageTime: { ok: true, value: { median: 41, mean: 52.5 } },
    sections: {
      ok: true,
      value: {
        from: "2026-10-14",
        to: "2026-10-20",
        sessions: 50,
        reach: [{ section: "trust_strip", sessions: 40 }],
        started: 5,
        testimonials: { seen: 10, started: 2 },
      },
    },
    sectionTime: {
      ok: true,
      value: {
        from: SECTION_TIME_FROM,
        to: "2026-10-20",
        sessions: 100,
        sections: [
          { section: "trust_strip", sessions: 100, ms: 1_400_000 },
          { section: "faq", sessions: 20, ms: 90_000 },
        ],
      },
    },
    ...over,
  });
}

describe("landing time", () => {
  it("compares the arms on the average time with its chance, the medians in the small print", () => {
    const time = livePayload().comparisons[0]!.metrics.at(-1)!;
    expect(time).toMatchObject({ label: "Avg. time on page", unit: "mmss", a: 8000, b: 9000 });
    // 8 s over 200 views against 9 s over 120, 10 s either way: z = 1 / √(100/199 + 100/119).
    expect(time.verdict).toBe("81% chance B is better (PostHog) · medians: A 0:05.0, B 0:05.0");
    expect(livePayload().rows.map((r) => r.meanSeconds)).toEqual([8, 9]);
  });

  it("reads Welch's test on the capped seconds, and refuses under 30 timed views an arm", () => {
    // n views of an average and a variance, as PostHog's count, avg and sum of squares give them.
    const arm = (n: number, mean: number, variance = 1250) =>
      ({ meanSeconds: mean, phTimed: n, phTimeSq: n * (variance + mean ** 2) }) as ArmRow;
    // Each s²/n is 1250 · 101/100 / 101 = 12.5: an error of 5, so 10 s apart is z = 2.
    expect(timeVerdict(arm(101, 41), arm(101, 51))).toBe("98% chance B is better");
    expect(timeVerdict(arm(101, 51), arm(101, 41))).toBe("98% chance A is better");
    expect(timeVerdict(arm(101, 41, 0), arm(101, 41, 0))).toBe("No difference");
    // 30 views is enough, and the spread is the sample's (n − 1): 1450 / 29 = 50 an arm, so
    // z = 10 / √100 = 1, 84% (dividing by n would read 85%).
    expect(timeVerdict(arm(30, 41, 1450), arm(30, 51, 1450))).toBe("84% chance B is better");
    expect(timeVerdict(arm(29, 41), arm(500, 51))).toBe("Too few to call");
    const unread = { meanSeconds: null, phTimed: null, phTimeSq: null } as ArmRow;
    expect(timeVerdict(unread, arm(500, 51))).toBe("Too few to call");
    // Under 30 PostHog visits the arm has no average at all, as for bounce.
    const few = livePayload({
      armEngagement: {
        hero: { ok: true, value: [ph("white_card", 200, 80), ph("white_video", 29, 5)] },
      },
    });
    expect(few.comparisons[0]!.metrics.at(-1)!.verdict).toBe("PostHog saw too few visits");
  });

  it("reads an ended test's time as its decision, keeping the chance after it", () => {
    const first = LANDING_TESTS.find((t) => t.key === "hero-first-run")!;
    first.winner = "white_video";
    try {
      const p = buildLanding({
        facts: factsFixture({
          from: "2026-10-07",
          to: "2026-10-13",
          visits: [],
          starts: [],
          subs: [],
        }),
        filters: parseFilters(
          { period: "custom", from: "2026-10-07", to: "2026-10-13" },
          "2026-10-14"
        ),
        today: "2026-10-14",
        now: new Date("2026-10-14T12:00:00Z"),
        armEngagement: {
          "hero-first-run": {
            ok: true,
            value: [ph("white_card", 200, 80), ph("white_video", 120, 30)],
          },
        },
        engagement: null,
        sections: null,
      });
      expect(p.comparisons.map((c) => c.key)).toEqual(["hero-first-run"]);
      expect(p.comparisons[0]!.metrics.at(-1)!.verdict).toBe(
        "Ended · B kept · 81% chance B is better (PostHog) · medians: A 0:05.0, B 0:05.0"
      );
    } finally {
      delete first.winner;
    }
  });

  it("gives each section its average seconds over the visits that reached it, and its reach", () => {
    const t = livePayload().sectionTime;
    // The hero comes first, as the design lists it; no time recorded for it here.
    expect(t?.ok && t.value?.rows.slice(0, 3)).toEqual([
      { section: "hero", name: "Hero", seconds: null, reach: 0 },
      { section: "trust_strip", name: "Trust strip", seconds: 14, reach: 1 },
      { section: "discover", name: "Discover", seconds: null, reach: 0 },
    ]);
    expect(t?.ok && t.value?.rows.find((r) => r.section === "faq")).toMatchObject({
      seconds: 4.5,
      reach: 0.2,
    });
    expect(livePayload({ sectionTime: { ok: true, value: null } }).sectionTime).toEqual({
      ok: true,
      value: null,
    });
    expect(livePayload({ sectionTime: { ok: false, error: "down" } }).sectionTime).toEqual({
      ok: false,
      error: "down",
    });
    expect(livePayload().sectionTimeFrom).toBe(SECTION_TIME_FROM);
  });
});

describe("PostHog's landing readers", () => {
  // A block, not an arrow's value: a function returned from beforeEach is run as a teardown,
  // and mockReset() returns the mock.
  beforeEach(() => {
    mockHogql.mockReset();
  });
  const answer = (rows: unknown[][]) => ({ ok: true, cut: null, rows });
  const query = (has: string) =>
    String(mockHogql.mock.calls.map(([q]) => String(q)).find((q) => q.includes(has)));

  it("reads each section's time in view from its first day, capped per visit", async () => {
    mockHogql.mockImplementation(async (q: string) =>
      q.includes("section_time")
        ? answer([
            ["trust_strip", 180, 2_520_000],
            [null, 3, 0],
          ])
        : answer([[200]])
    );
    const to = addDays(SECTION_TIME_FROM, 5);
    expect(await fetchLandingSectionTime(addDays(SECTION_TIME_FROM, -10), to)).toEqual({
      ok: true,
      value: {
        from: SECTION_TIME_FROM,
        to,
        sessions: 200,
        sections: [{ section: "trust_strip", sessions: 180, ms: 2_520_000 }],
      },
    });
    const q = query("section_time");
    // A visit that only reached a section (section_seen) counts with no time.
    expect(q).toContain("WHERE event IN ('section_seen', 'section_time')");
    expect(q).toContain(
      "least(coalesce(sumIf(toFloat(properties.visible_ms), event = 'section_time'), 0), 600000)"
    );
    expect(query("landing_page_view")).toContain("uniqExact($session_id)");
  });

  it("reads nothing before the time was recorded", async () => {
    expect(
      await fetchLandingSectionTime(addDays(SECTION_TIME_FROM, -7), addDays(SECTION_TIME_FROM, -1))
    ).toEqual({ ok: true, value: null });
    expect(mockHogql).not.toHaveBeenCalled();
  });

  it("reads the average time beside the median, each view up to 30 minutes", async () => {
    mockHogql.mockImplementation(async (q: string) =>
      q.includes("$prev_pageview_max_scroll_percentage")
        ? answer([["white_card", 100, 80, 50, 20, 5, 41, 52.5, 98, 400_000]])
        : q.includes("countIf(event = 'cta_click')")
          ? answer([["white_card", 120, 40, 12]])
          : answer([[41, null]])
    );
    const arms = await fetchLandingEngagement("2026-09-01", "2026-09-07");
    expect(arms).toMatchObject({
      ok: true,
      value: [
        {
          arm: "white_card",
          sessions: 120,
          medianSeconds: 41,
          meanSeconds: 52.5,
          timed: 98,
          sqSeconds: 400_000,
        },
      ],
    });
    expect(await fetchLandingTime("2026-09-01", "2026-09-07")).toEqual({
      ok: true,
      value: { median: 41, mean: null },
    });
    const capped = "least(toFloat(properties.$prev_pageview_duration), 1800)";
    const leaves = query("$prev_pageview_max_scroll_percentage");
    expect(leaves).toContain(`avg(${capped})`);
    // The chance reads the same capped views the average does: their count and squares.
    expect(leaves).toContain(`count(${capped}) AS timed`);
    expect(leaves).toContain(`sum(${capped} * ${capped}) AS sq_dur`);
    expect(query("SELECT quantile(0.5)")).toContain(`avg(${capped})`);
  });
});

describe("the landing page's screen", () => {
  afterEach(cleanup);

  it("shows the averages and each section's time, as the design names them", () => {
    screenData.payload = livePayload();
    render(createElement(ApLanding));
    const sort = screen.getByRole("button", { name: "Sort by Avg. time" });
    fireEvent.click(sort);
    expect(sort.closest("[role=columnheader]")).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByText("Avg. time on page")).toBeInTheDocument();
    const engagement = within(screen.getByRole("region", { name: "Engagement" }));
    expect(engagement.getByText("Avg. time")).toBeInTheDocument();
    expect(engagement.getByText("0:53")).toBeInTheDocument();
    const card = within(screen.getByRole("region", { name: "Section time" }));
    // The caption sits beside the title in one row, as the design has it, not under it.
    const caption = card.getByText(
      "Avg. seconds in view · share of visitors who reach the section"
    );
    expect(caption.parentElement).toBe(
      card.getByRole("heading", { name: "Section time" }).parentElement
    );
    expect(caption.parentElement).toHaveClass("items-baseline", "justify-between");
    expect(caption.parentElement).not.toHaveClass("flex-col");
    // Name, then the bar (the time against the longest section's), the time and the reach.
    const row = (name: string) => [...card.getByText(name).parentElement!.children];
    const bar = (cells: Element[]) =>
      parseFloat((cells[1]!.firstElementChild as HTMLElement).style.width);
    expect(row("Trust strip").map((c) => c.textContent)).toEqual([
      "Trust strip",
      "",
      "14s",
      "100% reach",
    ]);
    expect(bar(row("Trust strip"))).toBe(100);
    // FAQ: 4.5 s against the trust strip's 14 s.
    expect(row("FAQ").map((c) => c.textContent)).toEqual(["FAQ", "", "5s", "20% reach"]);
    expect(bar(row("FAQ"))).toBeCloseTo(32.14);
    expect(bar(row("Hero"))).toBe(0);
    expect(card.queryByText(/Recorded from/)).toBeNull();
    // The engagement boxes stay three across, on a phone too.
    expect(engagement.getByText("CTA clicks").parentElement!.parentElement).toHaveClass(
      "grid-cols-3"
    );
    // The reviews block, worded as the design words it.
    const reviews = within(screen.getByRole("region", { name: "Reviews" }));
    expect(reviews.getByText("Review block on page")).toBeInTheDocument();
    expect(
      reviews.getByText("Seen by 20% of visitors · start CVR after seeing 20.0% vs 7.5% without")
    ).toBeInTheDocument();
  });

  it("shades any spread as it reads, writes percentages as the design does, and tabs tests by code", () => {
    // Two tests in the range: the running hero test (from 14 Oct) and its first run.
    const subs = (arm: string, n: number, from: number) =>
      Array.from({ length: n }, (_, i) =>
        sub({ id: from + i, day: "2026-10-15", at: "2026-10-15T10:00:00Z", arm })
      );
    screenData.payload = buildLanding({
      facts: factsFixture({
        from: "2026-10-07",
        to: "2026-10-20",
        visits: [
          { day: "2026-10-15", arm: "white_card", src: null, n: 1000 },
          { day: "2026-10-15", arm: "white_video", src: null, n: 1000 },
        ],
        starts: [],
        subs: [...subs("white_card", 100, 1000), ...subs("white_video", 104, 2000)],
      }),
      filters: parseFilters(
        { period: "custom", from: "2026-10-07", to: "2026-10-20" },
        "2026-10-21"
      ),
      today: "2026-10-21",
      now: new Date("2026-10-21T12:00:00Z"),
      // 40.2% against 40.4% bounce: both read "40%".
      armEngagement: {
        hero: { ok: true, value: [ph("white_card", 500, 201), ph("white_video", 500, 202)] },
      },
      engagement: null,
      sections: null,
    });
    render(createElement(ApLanding));
    const [, a, b] = screen.getAllByRole("row");
    const cells = (r: HTMLElement) => within(r).getAllByRole("cell");
    const shade = (r: HTMLElement, i: number) => cells(r)[i]!.firstElementChild!;
    // Submit CVR 10.0% against 10.4%: a 4% spread, shaded best to worst all the same.
    expect(shade(a!, 4)).toHaveTextContent("10.0%");
    expect(shade(a!, 4)).toHaveStyle({ color: "#a62700", fontWeight: "700" });
    expect(shade(b!, 4)).toHaveTextContent("10.4%");
    expect(shade(b!, 4)).toHaveStyle({ color: "#1f5c42", fontWeight: "700" });
    // Bounce whole, and two cells that read the same are shaded the same.
    expect(shade(a!, 7)).toHaveTextContent(/^40%$/);
    expect(shade(b!, 7)).toHaveTextContent(/^40%$/);
    expect(shade(a!, 7)).toHaveStyle({ color: "#161021", fontWeight: "500" });
    expect(shade(b!, 7)).toHaveStyle({ color: "#161021", fontWeight: "500" });
    // Payment CVR to a hundredth, as the design's "0.19%".
    expect(shade(a!, 5)).toHaveTextContent(/^0\.00%$/);

    // The compare tabs carry the tests' codes, in one row that scrolls on a phone.
    const tabs = screen.getByRole("group", { name: "Test to compare" });
    expect(
      within(tabs)
        .getAllByRole("button")
        .map((t) => t.textContent)
    ).toEqual(["#6", "#6 · run 1"]);
    expect(tabs.parentElement).toHaveClass("w-max");
    expect(tabs.parentElement!.parentElement).toHaveClass("overflow-x-auto");
    const compare = within(screen.getByRole("region", { name: "Hero: video vs question 1" }));
    expect(compare.getByText("10.0%")).toBeInTheDocument();
    expect(compare.getByText("10.4%")).toBeInTheDocument();
    expect(compare.getAllByText(/^40%$/)).toHaveLength(2);
    expect(
      compare.getByText(/^\d+% chance B is better \(PostHog\) · medians: /)
    ).toBeInTheDocument();
    fireEvent.click(within(tabs).getByRole("button", { name: "#6 · run 1" }));
    expect(
      screen.getByRole("heading", { name: "Hero: video vs question 1, first run" })
    ).toBeInTheDocument();
  });

  it("shows the reach alone, and when the time starts, for days before it was recorded", () => {
    screenData.payload = livePayload({ sectionTime: { ok: true, value: null } });
    render(createElement(ApLanding));
    const card = within(screen.getByRole("region", { name: "Section time" }));
    expect(card.getByText(/^Recorded from /)).toHaveTextContent(
      `Recorded from ${rangeLabel(SECTION_TIME_FROM, SECTION_TIME_FROM)}`
    );
    expect(card.getByText("Trust strip").parentElement).toHaveTextContent("Trust strip—80% reach");
    // No time yet, so no bar: the reach is only in words.
    const bar = card.getByText("Trust strip").parentElement!.children[1]!.firstElementChild;
    expect(parseFloat((bar as HTMLElement).style.width)).toBe(0);
  });
});
