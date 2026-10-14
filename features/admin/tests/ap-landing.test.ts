import { describe, expect, it } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildLanding,
  engagementWindows,
  LANDING_TESTS,
  rateVerdict,
  revenueVerdict,
  testWindow,
  type ArmRow,
} from "@features/admin/server/ap/landing";
import type { LandingArmEngagement } from "@features/admin/server/ap/posthog";
import {
  LANDING_HERO_VIDEO_LAUNCH_DAY,
  LANDING_TEST_START_DAY,
} from "@shared/experiments/landingVariant";

import { factsFixture, sub } from "./ap-fixtures";

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

    const ph = (arm: string, sessions: number, bounced: number): LandingArmEngagement => ({
      arm,
      sessions,
      bounced,
      cta: 0,
      leaves: sessions,
      scroll: [sessions, 0, 0, 0],
      medianSeconds: 5,
    });
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
    const withMedian = buildLanding({
      facts: live,
      filters: lf,
      today: "2026-10-21",
      now,
      armEngagement: {},
      engagement: { ok: true, value: [ph("white_card", 200, 80), ph("white_video", 20, 5)] },
      pageMedian: { ok: true, value: 7.25 },
      sections: null,
    });
    expect(withMedian.engagement?.ok && withMedian.engagement.value.medianSeconds).toBe(7.25);
    expect(q.rows.map((r) => r.testShort)).toEqual([
      "#6 · Hero video vs Q1",
      "#6 · Hero video vs Q1",
    ]);
    expect(q.sections).toEqual({ ok: true, value: null });
  });
});
