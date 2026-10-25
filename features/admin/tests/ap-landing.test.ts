// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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

import { parseFilters } from "@features/admin/server/ap/filters";
import type { PtsPayload } from "@features/admin/server/ap/pay-to-start";
import {
  buildLanding,
  engagementWindows,
  LANDING_TESTS,
  testWindow,
} from "@features/admin/server/ap/landing";
import {
  fetchLandingEngagement,
  fetchLandingTime,
  type LandingArmEngagement,
} from "@features/admin/server/ap/posthog";
import ApLanding from "@features/admin/ui/ap/ApLanding";
import {
  LANDING_HERO_VIDEO_LAUNCH_DAY,
  LANDING_TEST_START_DAY,
} from "@shared/experiments/landingVariant";

import { factsFixture, sub } from "./ap-fixtures";

/**
 * PostHog's engagement for one arm: `sessions` visits, `bounced` of them bounced, a tenth
 * clicked a call to action, everyone scrolled a quarter and half of them half way.
 */
const ph = (arm: string, sessions: number, bounced: number): LandingArmEngagement => {
  const mean = arm === "white_video" ? 9 : 8;
  return {
    arm,
    sessions,
    bounced,
    cta: Math.round(sessions / 10),
    leaves: sessions,
    scroll: [sessions, Math.round(sessions / 2), 0, 0],
    medianSeconds: 5,
    meanSeconds: mean,
    timed: sessions,
    sqSeconds: sessions * (100 + mean ** 2),
  };
};

const test = (key: string) => LANDING_TESTS.find((t) => t.key === key)!;
const now = new Date("2026-10-13T12:00:00Z");

describe("landing test windows", () => {
  it("runs a live test to yesterday, or today in a range running through today, and clips every test to the range", () => {
    expect(testWindow(test("hero"), "2026-10-01", "2026-10-31", "2026-11-01")).toEqual({
      from: LANDING_TEST_START_DAY,
      to: "2026-10-31",
    });
    // "Today" (or a range running through it) reads the test's visits of today too.
    expect(testWindow(test("hero"), "2026-11-01", "2026-11-01", "2026-11-01")).toEqual({
      from: "2026-11-01",
      to: "2026-11-01",
    });
    // An ended test keeps its own days: clipped to the range, or none outside it.
    expect(testWindow(test("hero-first-run"), "2026-10-10", "2026-10-31", "2026-11-01")).toEqual({
      from: "2026-10-10",
      to: "2026-10-13",
    });
    expect(testWindow(test("hero-first-run"), "2026-10-14", "2026-10-31", "2026-11-01")).toBeNull();
    expect(testWindow(test("hero-first-run"), "2026-09-01", "2026-10-31", "2026-11-01")).toEqual({
      from: LANDING_HERO_VIDEO_LAUNCH_DAY,
      to: "2026-10-13",
    });
  });

  it("reads PostHog per arm only for the round-3 runs", () => {
    const keys = engagementWindows("2026-08-01", "2026-10-31", "2026-11-01").map((w) => w.key);
    expect(keys).toEqual(["hero", "hero-first-run"]);
    expect(test("hero-first-run").from).toBe(LANDING_HERO_VIDEO_LAUNCH_DAY);
  });
});

describe("buildLanding", () => {
  const filters = parseFilters(
    { period: "custom", from: "2026-10-01", to: "2026-10-07" },
    "2026-10-13"
  );
  const armFacts = () =>
    factsFixture({
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
          camp: null,
          term: null,
          cq: null,
          email: true,
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
          camp: null,
          term: null,
          cq: null,
          email: true,
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
          camp: null,
          term: null,
          cq: null,
          email: false,
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
          full: true,
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

  it("counts each arm's visits, starts and people inside the test's own days, without probes", () => {
    const p = buildLanding({
      facts: armFacts(),
      previous: null,
      filters,
      today: "2026-10-13",
      now,
      armEngagement: {},
      engagement: null,
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
      // The arm's days (7 Oct) are before the EUR 1.99 was on sale (23 Oct): no rate, never 0%.
      preCvr: null,
    });
    // A full unlock per visit, as the table's other rates are.
    expect(a?.fullCvr).toBeCloseTo(0.01);
    expect(b).toMatchObject({ arm: "white_video", visits: 120, starts: 18, subs: 0, fullCvr: 0 });
    expect(a?.startCvr).toBeCloseTo(0.12);
    expect(a).toMatchObject({ bounce: null, cta: null, scroll: null });
  });

  it("counts a pre-unlock per visit, as its other rates are, once the EUR 1.99 is on sale", () => {
    // The running test's days 24-30 Oct: 200 visits to version A, one finisher who paid
    // EUR 1.99 and then the full report, one who paid nothing, and E07's EUR 0 gift is none.
    const at = Date.parse("2026-10-25T12:00:00Z") / 1000;
    const facts = factsFixture({
      from: "2026-10-24",
      to: "2026-10-30",
      visits: [{ day: "2026-10-25", arm: "white_card", src: null, n: 200 }],
      starts: [],
      subs: [
        sub({
          id: 1,
          day: "2026-10-25",
          at: "2026-10-25T10:00:00Z",
          arm: "white_card",
          pays: [
            [at, 1.99, "initial"],
            [at + 60, 19.99, "full_report"],
          ],
        }),
        sub({ id: 2, day: "2026-10-25", at: "2026-10-25T11:00:00Z", arm: "white_card" }),
        sub({
          id: 3,
          day: "2026-10-26",
          at: "2026-10-26T11:00:00Z",
          arm: "white_card",
          pays: [[at, 0, "initial"]],
        }),
      ],
      money: [],
    });
    const p = buildLanding({
      facts,
      previous: null,
      filters: parseFilters(
        { period: "custom", from: "2026-10-24", to: "2026-10-30" },
        "2026-10-31"
      ),
      today: "2026-10-31",
      now: new Date("2026-10-31T10:00:00Z"),
      armEngagement: {},
      engagement: null,
    });
    const a = p.rows.find((r) => r.arm === "white_card")!;
    expect(a.preCvr).toBeCloseTo(1 / 200);
    // The tile: finished surveys pre-unlocked over all finished surveys.
    expect(p.tiles.find((t) => t.key === "pre-cvr")!.value).toBeCloseTo(1 / 3);
    // "Free survey" sells it only through the report's gate: off, and none sold, blank with why.
    const page = (subs: ReturnType<typeof sub>[], gateOn: boolean | null) =>
      buildLanding({
        facts: factsFixture({ ...facts, subs }),
        previous: null,
        filters: parseFilters(
          { period: "custom", from: "2026-10-24", to: "2026-10-30", funnel: "free" },
          "2026-10-31"
        ),
        today: "2026-10-31",
        now: new Date("2026-10-31T10:00:00Z"),
        armEngagement: {},
        engagement: null,
        gateOn,
      });
    const free = (subs: ReturnType<typeof sub>[], gateOn: boolean | null) =>
      page(subs, gateOn).tiles.find((t) => t.key === "pre-cvr")!;
    const none = [sub({ id: 2, day: "2026-10-25", at: "2026-10-25T11:00:00Z", arm: "white_card" })];
    const off = "Not sold in the free survey: the report's €1.99 gate is switched off.";
    expect(free(none, false)).toMatchObject({ value: null, blocked: off });
    expect(free(none, true).value).toBe(0);
    expect(free(facts.subs, false).value).toBeCloseTo(1 / 3);
    // The tests' arms likewise, and the page says why once.
    const offPage = page(none, false);
    expect(offPage.rows.find((r) => r.arm === "white_card")!.preCvr).toBeNull();
    expect(offPage.notes).toContain(off);
    expect(page(none, true).rows.find((r) => r.arm === "white_card")!.preCvr).toBe(0);
  });

  it("takes bounce, time, CTA clicks and scroll from PostHog where it saw 30 visits an arm", () => {
    const live = factsFixture({
      from: "2026-10-14",
      to: "2026-10-20",
      visits: [],
      starts: [],
      subs: [],
    });
    const f = parseFilters(
      { period: "custom", from: "2026-10-14", to: "2026-10-20" },
      "2026-10-21"
    );
    const arms = {
      ok: true as const,
      value: [ph("white_card", 200, 80), ph("white_video", 20, 5)],
    };
    const p = buildLanding({
      facts: live,
      previous: null,
      filters: f,
      today: "2026-10-21",
      now,
      armEngagement: { hero: arms },
      engagement: arms,
    });
    const card = p.rows.find((r) => r.arm === "white_card")!;
    expect(card).toMatchObject({ bounce: 0.4, cta: 0.1, scroll: [1, 0.5, 0, 0], meanSeconds: 8 });
    // 20 visits: too few to read.
    expect(p.rows.find((r) => r.arm === "white_video")).toMatchObject({
      bounce: null,
      cta: null,
      scroll: null,
    });
    // The average row: every landing visit the range had, both arms.
    expect(p.engagement).toMatchObject({ ok: true, value: { sessions: 220 } });
    expect(p.engagement && p.engagement.ok && p.engagement.value.bounce).toBeCloseTo(85 / 220);
  });

  it("says why an arm's engagement is blank when PostHog could not be read", () => {
    const failed = { ok: false as const, error: "PostHog could not be read just now." };
    const f = parseFilters(
      { period: "custom", from: "2026-10-14", to: "2026-10-20" },
      "2026-10-21"
    );
    const p = buildLanding({
      facts: factsFixture({ from: "2026-10-14", to: "2026-10-20" }),
      previous: null,
      filters: f,
      today: "2026-10-21",
      now,
      armEngagement: { hero: failed },
      engagement: failed,
    });
    expect(p.unread).toEqual([
      `#6 · Landing hero: bounce, median time, CTA clicks and scroll are blank. ${failed.error}`,
    ]);
    expect(p.rows.every((r) => r.bounce === null && r.cta === null)).toBe(true);
  });

  it("writes the six headline figures over every visit, against the period before", () => {
    const facts = armFacts();
    const previous = factsFixture({
      from: "2026-09-24",
      to: "2026-09-30",
      visits: [{ day: "2026-09-25", arm: "white", src: null, n: 200 }],
      starts: [],
      subs: [sub({ id: 9, day: "2026-09-25", at: "2026-09-25T10:00:00Z" })],
      money: [],
    });
    const p = buildLanding({
      facts,
      previous,
      filters,
      today: "2026-10-13",
      now,
      armEngagement: {},
      engagement: null,
    });
    const tile = (key: string) => p.tiles.find((t) => t.key === key)!;
    expect(p.tiles.map((t) => t.label)).toEqual([
      "Survey start CVR",
      "Survey complete CVR",
      "Pre-unlock CVR",
      "Full-unlock CVR",
      "Revenue / visitor",
      "Revenue / survey complete",
    ]);
    // 300 visits (the probe's 7 out, every arm in), 30 starts (the probe's 2 out), 2 finishers.
    expect(tile("start-cvr").value).toBeCloseTo(30 / 300);
    expect(tile("complete-cvr").value).toBeCloseTo(2 / 30);
    // The range (1-7 Oct) is before the EUR 1.99 was on sale: blank with why, never 0%.
    expect(tile("pre-cvr")).toMatchObject({
      value: null,
      blocked:
        "Pre-unlock figures start on 23 Oct 2026, its first whole day on sale (from the evening before): pick a range from that day on.",
    });
    // The range's finishers who bought a full unlock (the fixture's first) over all of them.
    expect(tile("full-cvr").value).toBeCloseTo(1 / 2);
    expect(tile("rev-visit").value).toBeCloseTo(6.99 / 300);
    expect(tile("rev-sub")).toMatchObject({ value: 6.99 / 2, prev: 0 });
    // The week before had its visits but no starts: compared with 0%.
    expect(tile("start-cvr").prev).toBe(0);
    expect(p.compare).toEqual({
      from: "2026-09-24",
      to: "2026-09-30",
      label: "24 Sep – 30 Sep 2026",
    });
  });

  it("counts a full unlock against the people who finished in the range, not a sale in it", () => {
    const facts = armFacts();
    // A June finisher's full unlock paid in the range: a sale here, but not one of these people.
    facts.money.push({ ...facts.money[0]!, sid: 99, day: "2026-10-07", plan: "full_report" });
    const p = buildLanding({
      facts,
      previous: null,
      filters,
      today: "2026-10-13",
      now,
      armEngagement: {},
      engagement: null,
    });
    expect(p.tiles.find((t) => t.key === "full-cvr")!.value).toBeCloseTo(1 / 2);
  });

  it("leaves the start rates blank, with why, where starts aren't all recorded", () => {
    const f = parseFilters(
      { period: "custom", from: "2026-08-01", to: "2026-08-07" },
      "2026-10-13"
    );
    const p = buildLanding({
      facts: factsFixture({ from: "2026-08-01", to: "2026-08-07" }),
      previous: null,
      filters: f,
      today: "2026-10-13",
      now,
      armEngagement: {},
      engagement: null,
    });
    const why = "Survey starts before 18 Sep 2026 are incomplete once their drafts are cleared.";
    expect(p.tiles.find((t) => t.key === "start-cvr")!.blocked).toBe(why);
    expect(p.tiles.find((t) => t.key === "complete-cvr")!.blocked).toBe(why);
    expect(p.tiles.find((t) => t.key === "rev-visit")!.blocked).toBeNull();
  });

  it("shows pay to start's live pages under All funnels, and leaves them out, saying so, under Free survey or before launch", () => {
    const pts = {
      funnels: [
        {
          key: "full",
          label: "Pay to start · €29.99",
          live: true,
          steps: [
            { label: "Visits", n: 40 },
            { label: "Checkout started", n: 4 },
            { label: "Paid €29.99", n: 2 },
            // A 100% code's buyer finished too: no share of Paid.
            { label: "Survey finished", n: 2 },
          ],
          // One of the two paying buyers has finished the survey.
          paidFinished: 1,
        },
      ],
      notes: [
        "No ad in this range lands on a pay-to-start page yet.",
        "2 visits to the pay-to-start pages came before the two pages were counted apart, so neither offer's visits include them.",
        "Pay after the report is paid after the survey, sometimes days later (the 72-hour email): its last few days here will still grow.",
      ],
    } as unknown as PtsPayload;
    const at = (funnel: string) =>
      buildLanding({
        facts: armFacts(),
        previous: null,
        filters: parseFilters(
          { period: "custom", from: "2026-10-01", to: "2026-10-07", funnel },
          "2026-10-13"
        ),
        today: "2026-10-13",
        now,
        armEngagement: {},
        engagement: null,
        pts,
      }).payFirst!;
    expect(at("all").rows).toEqual([
      expect.objectContaining({ key: "full", visitors: 40, checkout: 4, paid: 2, p2c: 0.5 }),
    ]);
    // Only the notes about the pages' own steps: not ads, nor the free survey's funnels.
    expect(at("all").notes).toEqual([
      "2 visits to the pay-to-start pages came before the two pages were counted apart, so neither offer's visits include them.",
    ]);
    const free = at("free");
    expect(free.rows).toEqual([]);
    expect(free.notes.join(" ")).toMatch(/Free survey, which leaves pay to start out/);
    // A range ending before the pages went live: no row of zeros, but when they started.
    pts.funnels[0]!.live = false;
    const before = at("all");
    expect(before.rows).toEqual([]);
    expect(before.notes.join(" ")).toMatch(/went live on 22 Oct 2026/);
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
          cta: 12,
          leaves: 100,
          scroll: [80, 50, 20, 5],
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
    // A view without a duration stays out: PostHog's least(NULL, 1800) is 1800.
    const capped =
      "if(isNull(properties.$prev_pageview_duration), NULL, least(toFloat(properties.$prev_pageview_duration), 1800))";
    expect(query("$prev_pageview_max_scroll_percentage")).toContain(`avg(${capped})`);
    expect(query("SELECT quantile(0.5)")).toContain(`avg(${capped})`);
  });
});

describe("the landing page's screen", () => {
  afterEach(cleanup);
  const f = parseFilters({ period: "custom", from: "2026-10-14", to: "2026-10-20" }, "2026-10-21");
  const arms = { ok: true as const, value: [ph("white_card", 200, 80), ph("white_video", 60, 15)] };
  const payload = () =>
    buildLanding({
      facts: factsFixture({
        from: "2026-10-14",
        to: "2026-10-20",
        visits: [
          { day: "2026-10-15", arm: "white_card", src: null, n: 300 },
          { day: "2026-10-15", arm: "white_video", src: null, n: 280 },
        ],
        starts: [],
        subs: [sub({ id: 5, day: "2026-10-15", arm: "white_card" })],
        money: [],
      }),
      previous: null,
      filters: f,
      today: "2026-10-21",
      now,
      armEngagement: { hero: arms },
      engagement: arms,
      pageTime: { ok: true, value: { median: 30, mean: 44 } },
    });

  it("draws the six tiles, the tests with both unlock columns, and engagement per page", () => {
    screenData.payload = payload();
    render(createElement(ApLanding));
    expect(screen.getAllByText("Survey start CVR").length).toBeGreaterThan(0);
    expect(screen.getByText("Revenue / survey complete")).toBeTruthy();
    expect(screen.queryByText("Initial plan not on sale yet")).toBeNull();
    const tests = screen.getByRole("table", { name: "Landing tests and variants" });
    const heads = within(tests)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(heads).toEqual([
      "Test · variant",
      "Status",
      "Visits",
      "Start CVR",
      "Submit CVR",
      "Pre-unlock CVR",
      "Full-unlock CVR",
      "€ / visit",
      "Bounce",
      "Median time",
    ]);
    const eng = screen.getByRole("table", { name: "Engagement per landing page" });
    expect(within(eng).getByText("Scroll depth reached")).toBeTruthy();
    expect(within(eng).getByText("All landing pages")).toBeTruthy();
    expect(within(eng).getByText("Every visit together · median time")).toBeTruthy();
    // The card's bounce 40%, the video's 25%; the average 95 of 260.
    expect(within(eng).getByText("40%")).toBeTruthy();
    expect(within(eng).getByText("36.5%")).toBeTruthy();
    // Gone in the design's update: the A/B compare, reviews and section time.
    expect(screen.queryByText("No test to compare")).toBeNull();
    expect(screen.queryByText("Reviews")).toBeNull();
    expect(screen.queryByText("Section time")).toBeNull();
    // The sidebar's "Assessment page" link lands on this table.
    expect(document.getElementById("assessment-page")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });
});
