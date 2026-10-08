import { describe, expect, it } from "vitest";
import {
  AXIS_VALID_FROM,
  buildAxisTrends,
  CHART_AXES,
  MIN_ARM_COMPLETIONS,
  MIN_TREND_DAYS,
  rowsForAxis,
  type AxisFunnelRow,
} from "@features/attribution/server/axis-trends";
import { PRICE_TEST_START_DAY } from "@features/checkout/server/reportPurchase";
import { LANDING_HERO_VIDEO_LAUNCH_DAY } from "@shared/experiments/landingVariant";

/**
 * Most tests below read ROUND 2 of the landing test (V1 vs V2, from 21 Aug): a
 * historical read, the reason `includeRetired` and `validFrom` exist. Production's
 * own landing cut is round 3's launch day (asserted in the first test).
 */
const ROUND2 = { landing: "2026-08-21" } as const;

/** Days of rows for one axis+arm, ending on `lastDay`. */
function rows(
  axis: string,
  arm: string,
  opts: { days: number; lastDay: string; completions: number; checkouts: number; paid?: number }
): AxisFunnelRow[] {
  const end = Date.parse(`${opts.lastDay}T00:00:00Z`);
  return Array.from({ length: opts.days }, (_, i) => ({
    axis,
    arm,
    day: new Date(end - (opts.days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    completions: opts.completions,
    checkouts: opts.checkouts,
    paid: opts.paid ?? 0,
  }));
}

/** `day` moved by `n` days, as YYYY-MM-DD. */
const plusDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe("axis trend charts — which experiments may be drawn", () => {
  it("charts Pricing 3.0 and the landing test's round 3, and nothing else", () => {
    /**
     * This is the live-list assertion, and it is the one thing in this file that
     * must track production rather than a fixture — an axis quietly re-added here
     * without being randomised is a chart of a test nobody is running. Pricing 3.0
     * (A3 vs B3) is live, and the landing test is live again for round 3 (V2's card
     * vs V3's video), cut at that round's own launch day.
     */
    expect([...CHART_AXES]).toEqual(["pricing", "landing"]);
    expect(AXIS_VALID_FROM.landing!.day).toBe(LANDING_HERO_VIDEO_LAUNCH_DAY);
    const trends = buildAxisTrends(
      [
        ...rows("landing", "white", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 20,
          checkouts: 4,
        }),
        ...rows("landing", "white_prev", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 20,
          checkouts: 4,
        }),
      ],
      "2026-09-30"
    );
    // Round 2's rows reach nothing: their arms are retired and their days predate round 3.
    expect(trends.charted).toHaveLength(0);
    expect(trends.counts).toHaveLength(0);
    expect(trends.skipped.map((s) => s.axis)).toEqual(["pricing", "landing"]);
  });

  it("drops rows for an axis that is not in the list it was given", () => {
    /**
     * The gate is the AXIS LIST, not the data. The way this bug actually happens
     * is a developer writing `Object.keys(AXIS_TITLES)`, which contains the
     * concluded paywall, survey-theme and landing axes — and the RPC still emits
     * `survey` rows today, so this is a live guard.
     *
     * Asserted against a list without the axis on purpose, so every one of these
     * has something to iterate and can fail.
     */
    for (const [axis, a, b] of [
      ["paywall", "treatment", "control"],
      ["survey", "white", "dark"],
    ] as const) {
      const trends = buildAxisTrends(
        [
          ...rows(axis, a, { days: 30, lastDay: "2026-09-30", completions: 20, checkouts: 4 }),
          ...rows(axis, b, { days: 30, lastDay: "2026-09-30", completions: 20, checkouts: 4 }),
        ],
        "2026-09-30",
        ["landing"],
        { includeRetired: true, validFrom: ROUND2 }
      );
      expect(trends.charted).toHaveLength(0);
      expect(trends.counts.map((c) => c.axis)).not.toContain(axis);
      expect(trends.skipped.map((s) => s.axis)).not.toContain(axis);
    }
  });

  it("reads the price test from Pricing 3.0's own arms and its lists' first whole day only", () => {
    expect(AXIS_VALID_FROM.pricing?.day).toBe(PRICE_TEST_START_DAY);
    const launch = PRICE_TEST_START_DAY;
    const input = [
      // The concluded 2.x arms, still in the data for everyone who bought under them.
      ...rows("pricing", "A", { days: 30, lastDay: "2026-10-20", completions: 20, checkouts: 4 }),
      ...rows("pricing", "B", { days: 30, lastDay: "2026-10-20", completions: 20, checkouts: 4 }),
      // 3.0 arms on days BEFORE the lists started: readers re-priced by a re-sync.
      ...rows("pricing", "A3", { days: 30, lastDay: "2026-10-20", completions: 20, checkouts: 4 }),
      ...rows("pricing", "B3", { days: 30, lastDay: "2026-10-20", completions: 20, checkouts: 2 }),
    ];
    const { rows: scoped, validFrom } = rowsForAxis(input, "pricing");
    expect(validFrom).toBe(launch);
    expect(new Set(scoped.map((r) => r.arm))).toEqual(new Set(["A3", "B3"]));
    expect(scoped.every((r) => r.day >= launch)).toBe(true);
    expect(scoped.length).toBeGreaterThan(0);

    // Every day from the launch to 20 Oct, 20 finished a day per arm: a chart, labelled
    // as the 3.0 lists, off the post-launch days alone. Counted from the launch day, so
    // moving the launch moves the totals instead of breaking this.
    const days = (Date.parse("2026-10-20") - Date.parse(launch)) / 86_400_000 + 1;
    const trends = buildAxisTrends(input, "2026-10-20");
    const chart = trends.charted.find((c) => c.axis === "pricing");
    expect(chart?.legendFirst).toBe("Pricing 3.0 higher");
    expect(chart?.legendLast).toBe("Pricing 3.0 lower");
    expect(chart?.headline).toContain(`${4 * days}/${20 * days}`);
    expect(chart?.headline).toContain(`${2 * days}/${20 * days}`);

    // Only the 2.x arms: a live axis with nothing to compare says so; it is never
    // drawn from the concluded test's rows.
    const legacy = buildAxisTrends(
      input.filter((r) => r.arm === "A" || r.arm === "B"),
      "2026-10-20"
    );
    expect(legacy.charted.map((c) => c.axis)).not.toContain("pricing");
    expect(legacy.counts.map((c) => c.axis)).not.toContain("pricing");
    expect(legacy.skipped.find((s) => s.axis === "pricing")?.caption).toContain("no arm has data");
  });

  it("charts an axis with enough history and computes the rate from the rows", () => {
    const trends = buildAxisTrends(
      [
        ...rows("landing", "white", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 2,
          paid: 1,
        }),
        ...rows("landing", "white_prev", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 1,
        }),
      ],
      "2026-09-30",
      ["landing"],
      { includeRetired: true, validFrom: ROUND2 }
    );
    const chart = trends.charted.find((c) => c.axis === "landing");
    expect(chart).toBeDefined();
    // 30 days x 10 = 300 completions, x2 = 60 checkouts => 20%.
    expect(chart!.headline).toContain("60/300 = 20%");
    expect(chart!.headline).toContain("30/300 = 10%");
    // Ordered by LABEL ("Landing Page V1 (First Design)" < "Landing Page V2 (Survey in Hero, before V3)"), not by volume. Volume
    // order flipped colours between consecutive digests once two arms were
    // within one day of each other.
    expect(chart!.arms[0]).toBe("white_prev");
    // Paid is a COUNT on each arm's own line, never a second drawn series. The
    // sentence that used to argue why it is not drawn is gone.
    expect(chart!.caption).toContain("30 paid");
    expect(chart!.caption).not.toMatch(/too few|deliberately not drawn/);
  });

  it("puts each arm's paid count on its line at any volume", () => {
    // Replaces a test for the sentence that used to argue why purchases were not
    // drawn as a second line. That argument is gone; the counts are what a reader
    // needed from it, and they are now unconditional.
    const many = buildAxisTrends(
      [
        ...rows("landing", "white", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 5,
          paid: 3,
        }),
        ...rows("landing", "white_prev", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 4,
          paid: 2,
        }),
      ],
      "2026-09-30",
      ["landing"],
      { includeRetired: true, validFrom: ROUND2 }
    );
    const chart = many.charted.find((c) => c.axis === "landing")!;
    expect(chart.caption).toContain("90 paid");
    expect(chart.caption).toContain("60 paid");
    expect(chart.caption).not.toContain("too few");
  });
  it("gives a too-young axis its counts instead of only a sentence", () => {
    // The landing arms only became like-for-like when round 2 started. A trend
    // line needs 7 days; the numbers do not, and they are what the reader came
    // for. Two reviews of a charted version agreed a picture at this volume
    // invites a conclusion the data cannot support.
    const validFrom = ROUND2.landing;
    const trends = buildAxisTrends(
      [
        ...rows("landing", "white", {
          days: 3,
          lastDay: "2026-08-23",
          completions: 30,
          checkouts: 5,
        }),
        ...rows("landing", "white_prev", {
          days: 3,
          lastDay: "2026-08-23",
          completions: 30,
          checkouts: 5,
        }),
      ],
      "2026-08-23",
      ["landing"],
      { includeRetired: true, validFrom: ROUND2 }
    );
    expect(trends.charted.map((c) => c.axis)).not.toContain("landing");
    expect(trends.skipped.map((s) => s.axis)).not.toContain("landing");
    const young = trends.counts.find((c) => c.axis === "landing")!;
    // Glance line, then both arms' raw counts, never a rate.
    expect(young.text).toContain("*Landing page design* — since 21 Aug");
    expect(young.text).toContain("90 finished → 15 checkout → 0 paid");
    // It must say how much data there is, why the window starts where it does,
    // and when the chart will appear — not just "not enough data".
    expect(young.text).toContain("no clear winner yet");
    expect(young.text).toMatch(/chart from \d/);
    expect(validFrom).toBe("2026-08-21");
  });

  it("names the date the trend chart will actually carry a line", () => {
    // MIN_TREND_DAYS days must have PASSED, and the digest always reports on
    // yesterday — so the run that first has a line is validFrom + 7, not + 6.
    const trends = buildAxisTrends(
      [
        ...rows("landing", "white", {
          days: 1,
          lastDay: "2026-08-21",
          completions: 30,
          checkouts: 5,
        }),
        ...rows("landing", "white_prev", {
          days: 1,
          lastDay: "2026-08-21",
          completions: 30,
          checkouts: 5,
        }),
      ],
      "2026-08-21",
      ["landing"],
      { includeRetired: true, validFrom: ROUND2 }
    );
    expect(trends.counts.find((c) => c.axis === "landing")!.text).toContain("chart from 28 Aug");
  });

  it("refuses an axis whose smaller arm is too thin to trend", () => {
    const trends = buildAxisTrends(
      [
        ...rows("landing", "white", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 2,
        }),
        // One finisher a day for three days: far below the floor.
        ...rows("landing", "white_prev", {
          days: 3,
          lastDay: "2026-09-30",
          completions: 1,
          checkouts: 0,
        }),
      ],
      "2026-09-30",
      ["landing"],
      { includeRetired: true, validFrom: ROUND2 }
    );
    expect(trends.charted.map((c) => c.axis)).not.toContain("survey");
    const young = trends.counts.find((c) => c.axis === "landing")!;
    expect(young.text).toContain(`passes ${MIN_ARM_COMPLETIONS} finished`);
    expect(young.text).toContain("3 finished →");
    // Still shows both arms' numbers rather than withholding them.
    expect(young.text).toContain("300 finished");
  });

  it("states the gap from the leading arm's side, whichever arm that is", () => {
    // `delta` is a-minus-b, and arms are label-ordered, so the leader is often
    // `b`. The inconclusive branch used to name `a` unconditionally, and the
    // significant branch printed the winner's gap as a negative number.
    const trends = buildAxisTrends(
      [
        // "Landing Page V1 (First Design)" sorts first but converts far worse.
        ...rows("landing", "white_prev", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 40,
          checkouts: 2,
        }),
        ...rows("landing", "white", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 40,
          checkouts: 12,
        }),
      ],
      "2026-09-30",
      ["landing"],
      { includeRetired: true, validFrom: ROUND2 }
    );
    const chart = trends.charted.find((c) => c.axis === "landing")!;
    expect(chart.arms[0]).toBe("white_prev");
    expect(chart.caption).toContain(
      "Landing Page V2 (Survey in Hero, before V3) is genuinely ahead"
    );
    expect(chart.caption).not.toContain("Landing Page V1 (First Design) is genuinely ahead");
    // The winner's gap reads as a gain, not a loss.
    expect(chart.caption).toMatch(/ahead \(\+\d/);
  });

  it("says so plainly when only one arm has data", () => {
    const trends = buildAxisTrends(
      rows("landing", "white", { days: 30, lastDay: "2026-09-30", completions: 10, checkouts: 2 }),
      "2026-09-30",
      ["landing"],
      { includeRetired: true, validFrom: ROUND2 }
    );
    const gap = trends.skipped.find((s) => s.axis === "landing")!;
    expect(gap.caption).toContain("nothing to compare");
    expect(gap.caption).toContain("only Landing Page V2 (Survey in Hero, before V3) has data");
  });

  it("reads as English when NO arm has data", () => {
    // "only" used to be hoisted out of the one-arm branch, which made the
    // zero-arm caption read "no chart yet: only no arms have data". Two calls
    // rather than one: with `landing` the sole charted axis, a single fixture
    // can no longer supply one arm to one axis and none to another.
    const empty = buildAxisTrends([], "2026-09-30", ["landing"], {
      includeRetired: true,
      validFrom: ROUND2,
    });
    for (const gap of empty.skipped) {
      expect(gap.caption).not.toContain("only no");
      expect(gap.caption).not.toMatch(/only no arms? have/);
    }
    expect(empty.skipped.find((s) => s.axis === "landing")!.caption).toContain("no arm has data");

    const oneArmTrends = buildAxisTrends(
      rows("landing", "white", { days: 30, lastDay: "2026-09-30", completions: 10, checkouts: 2 }),
      "2026-09-30",
      ["landing"],
      { includeRetired: true, validFrom: ROUND2 }
    );
    expect(oneArmTrends.skipped.find((s) => s.axis === "landing")!.caption).toContain(
      "only Landing Page V2 (Survey in Hero, before V3) has data"
    );
  });

  it("clips each axis to its own like-for-like window", () => {
    // Round 3: a day before its launch day is cut, whatever arm name it carries.
    const launch = LANDING_HERO_VIDEO_LAUNCH_DAY;
    const all = [
      ...rows("landing", "white_card", {
        days: 1,
        lastDay: plusDays(launch, -3),
        completions: 99,
        checkouts: 99,
      }),
      ...rows("landing", "white_card", {
        days: 5,
        lastDay: plusDays(launch, 4),
        completions: 10,
        checkouts: 1,
      }),
    ];
    const scoped = rowsForAxis(all, "landing");
    expect(scoped.validFrom).toBe(launch);
    expect(scoped.rows.every((r) => r.day >= launch)).toBe(true);
    // The pre-launch day, which would have dragged the rate to ~70%, is gone.
    expect(scoped.rows).toHaveLength(5);

    // Round 2, read historically, keeps its own floor.
    const round2 = rowsForAxis(
      [
        ...rows("landing", "white", {
          days: 1,
          lastDay: "2026-08-01",
          completions: 99,
          checkouts: 99,
        }),
        ...rows("landing", "white", {
          days: 5,
          lastDay: "2026-08-25",
          completions: 10,
          checkouts: 1,
        }),
      ],
      "landing",
      { includeRetired: true, validFrom: ROUND2 }
    );
    expect(round2.validFrom).toBe(ROUND2.landing);
    expect(round2.rows).toHaveLength(5);
  });

  it("drops unattributable and retired arms rather than charting them as arms", () => {
    const lastDay = plusDays(LANDING_HERO_VIDEO_LAUNCH_DAY, 4);
    const scoped = rowsForAxis(
      [
        ...rows("landing", "white_card", { days: 5, lastDay, completions: 10, checkouts: 1 }),
        // tracker_arm returns the literal 'unknown' for a missing stamp; `control` is
        // round 1's dark landing and `white` round 2's V2, both retired.
        ...rows("landing", "unknown", { days: 5, lastDay, completions: 5, checkouts: 1 }),
        ...rows("landing", "control", { days: 5, lastDay, completions: 5, checkouts: 1 }),
        ...rows("landing", "white", { days: 5, lastDay, completions: 5, checkouts: 1 }),
      ],
      "landing"
    );
    expect([...new Set(scoped.rows.map((r) => r.arm))]).toEqual(["white_card"]);
  });

  it("will not claim a winner off too few conversions, however many surveys", () => {
    // 300 finishers per arm is plenty; three checkouts each is not. The caption
    // must refuse rather than report a measured dead heat.
    const trends = buildAxisTrends(
      [
        ...rows("landing", "white", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 0,
        }),
        ...rows("landing", "white_prev", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 0,
        }),
      ],
      "2026-09-30",
      ["landing"],
      { includeRetired: true, validFrom: ROUND2 }
    );
    const chart = trends.charted.find((c) => c.axis === "landing")!;
    expect(chart.caption).toContain("Not enough to compare yet");
    expect(chart.caption).not.toContain("No clear winner");
    expect(chart.caption).not.toContain("genuinely ahead");
  });

  it("needs a full trailing window before any axis charts", () => {
    expect(MIN_TREND_DAYS).toBe(7);
  });
});
