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

describe("axis trend charts — which experiments may be drawn", () => {
  it("never charts a concluded experiment — paywall, survey theme or pricing", () => {
    // Three independent layers, because the way this bug actually happens is a
    // developer writing `Object.keys(AXIS_TITLES)` — which contains all of them.
    expect([...CHART_AXES]).not.toContain("paywall");
    expect([...CHART_AXES]).not.toContain("survey");
    expect([...CHART_AXES]).not.toContain("pricing");
    expect([...CHART_AXES]).toEqual(["landing"]);

    // Even if the RPC regressed and started emitting rows for any of them, nothing
    // reaches Slack — not a chart, not a counts block, not a skip caption. The RPC
    // DOES still emit `pricing` and `survey`, so this is a live guard, not a
    // hypothetical one.
    for (const [axis, a, b] of [
      ["paywall", "treatment", "control"],
      ["survey", "white", "dark"],
      ["pricing", "A", "B"],
    ] as const) {
      const trends = buildAxisTrends(
        [
          ...rows(axis, a, { days: 30, lastDay: "2026-09-30", completions: 20, checkouts: 4 }),
          ...rows(axis, b, { days: 30, lastDay: "2026-09-30", completions: 20, checkouts: 4 }),
        ],
        "2026-09-30"
      );
      expect(trends.charted).toHaveLength(0);
      expect(trends.counts.map((c) => c.axis)).not.toContain(axis);
      expect(trends.skipped.map((s) => s.axis)).not.toContain(axis);
    }
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
      "2026-09-30"
    );
    const chart = trends.charted.find((c) => c.axis === "landing");
    expect(chart).toBeDefined();
    // 30 days x 10 = 300 completions, x2 = 60 checkouts => 20%.
    expect(chart!.headline).toContain("60/300 = 20%");
    expect(chart!.headline).toContain("30/300 = 10%");
    // Ordered by LABEL ("Landing Page V1 (First Design)" < "Landing Page V2 (Survey in Hero)"), not by volume. Volume
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
      "2026-09-30"
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
    const validFrom = AXIS_VALID_FROM.landing!.day;
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
      "2026-08-23"
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
      "2026-08-21"
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
      "2026-09-30"
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
      "2026-09-30"
    );
    const chart = trends.charted.find((c) => c.axis === "landing")!;
    expect(chart.arms[0]).toBe("white_prev");
    expect(chart.caption).toContain("Landing Page V2 (Survey in Hero) is genuinely ahead");
    expect(chart.caption).not.toContain("Landing Page V1 (First Design) is genuinely ahead");
    // The winner's gap reads as a gain, not a loss.
    expect(chart.caption).toMatch(/ahead \(\+\d/);
  });

  it("says so plainly when only one arm has data", () => {
    const trends = buildAxisTrends(
      rows("landing", "white", { days: 30, lastDay: "2026-09-30", completions: 10, checkouts: 2 }),
      "2026-09-30"
    );
    const gap = trends.skipped.find((s) => s.axis === "landing")!;
    expect(gap.caption).toContain("nothing to compare");
    expect(gap.caption).toContain("only Landing Page V2 (Survey in Hero) has data");
  });

  it("reads as English when NO arm has data", () => {
    // "only" used to be hoisted out of the one-arm branch, which made the
    // zero-arm caption read "no chart yet: only no arms have data". Two calls
    // rather than one: with `landing` the sole charted axis, a single fixture
    // can no longer supply one arm to one axis and none to another.
    const empty = buildAxisTrends([], "2026-09-30");
    for (const gap of empty.skipped) {
      expect(gap.caption).not.toContain("only no");
      expect(gap.caption).not.toMatch(/only no arms? have/);
    }
    expect(empty.skipped.find((s) => s.axis === "landing")!.caption).toContain("no arm has data");

    const oneArmTrends = buildAxisTrends(
      rows("landing", "white", { days: 30, lastDay: "2026-09-30", completions: 10, checkouts: 2 }),
      "2026-09-30"
    );
    expect(oneArmTrends.skipped.find((s) => s.axis === "landing")!.caption).toContain(
      "only Landing Page V2 (Survey in Hero) has data"
    );
  });

  it("clips each axis to its own like-for-like window", () => {
    const validFrom = AXIS_VALID_FROM.landing!.day;
    const all = [
      // A day BEFORE round 2 began: same arm name, different experiment.
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
    ];
    const scoped = rowsForAxis(all, "landing");
    expect(scoped.validFrom).toBe(validFrom);
    expect(scoped.rows.every((r) => r.day >= validFrom)).toBe(true);
    // The pre-round-2 day, which would have dragged the rate to ~70%, is gone.
    expect(scoped.rows).toHaveLength(5);
  });

  it("drops unattributable and retired arms rather than charting them as arms", () => {
    const scoped = rowsForAxis(
      [
        ...rows("landing", "white", {
          days: 5,
          lastDay: "2026-08-25",
          completions: 10,
          checkouts: 1,
        }),
        // tracker_arm returns the literal 'unknown' for a missing stamp, and
        // `control` is the retired round-1 dark landing page.
        ...rows("landing", "unknown", {
          days: 5,
          lastDay: "2026-08-25",
          completions: 5,
          checkouts: 1,
        }),
        ...rows("landing", "control", {
          days: 5,
          lastDay: "2026-08-25",
          completions: 5,
          checkouts: 1,
        }),
      ],
      "landing"
    );
    expect([...new Set(scoped.rows.map((r) => r.arm))]).toEqual(["white"]);
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
      "2026-09-30"
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
