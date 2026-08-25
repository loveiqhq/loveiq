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
  it("never charts a concluded experiment — paywall or survey theme", () => {
    // Three independent layers, because the way this bug actually happens is a
    // developer writing `Object.keys(AXIS_TITLES)` — which contains both.
    expect([...CHART_AXES]).not.toContain("paywall");
    expect([...CHART_AXES]).not.toContain("survey");
    expect([...CHART_AXES]).toEqual(["pricing", "landing"]);

    // Even if the RPC regressed and started emitting rows for either, nothing
    // reaches Slack — not a chart, not a counts block, not a skip caption.
    for (const [axis, a, b] of [
      ["paywall", "treatment", "control"],
      ["survey", "white", "dark"],
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
        ...rows("pricing", "A", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 2,
          paid: 1,
        }),
        ...rows("pricing", "B", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 1,
        }),
      ],
      "2026-09-30"
    );
    const chart = trends.charted.find((c) => c.axis === "pricing");
    expect(chart).toBeDefined();
    // 30 days x 10 = 300 completions, x2 = 60 checkouts => 20%.
    expect(chart!.headline).toContain("60/300 = 20%");
    expect(chart!.headline).toContain("30/300 = 10%");
    // Ordered by LABEL ("Pricing B" < "Pricing A"), not by volume. Volume
    // order flipped colours between consecutive digests once two arms were
    // within one day of each other.
    expect(chart!.arms[0]).toBe("A");
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
        ...rows("pricing", "A", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 5,
          paid: 3,
        }),
        ...rows("pricing", "B", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 4,
          paid: 2,
        }),
      ],
      "2026-09-30"
    );
    const chart = many.charted.find((c) => c.axis === "pricing")!;
    expect(chart.caption).toContain("90 paid");
    expect(chart.caption).toContain("60 paid");
    expect(chart.caption).not.toContain("too few");
  });
  it("gives a too-young axis its counts instead of only a sentence", () => {
    // Pricing's arms only became like-for-like on its repricing date. A trend
    // line needs 7 days; the numbers do not, and they are what the reader came
    // for. Two reviews of a charted version agreed a picture at this volume
    // invites a conclusion the data cannot support.
    const validFrom = AXIS_VALID_FROM.pricing!.day;
    const trends = buildAxisTrends(
      [
        ...rows("pricing", "A", { days: 3, lastDay: "2026-08-26", completions: 30, checkouts: 5 }),
        ...rows("pricing", "B", { days: 3, lastDay: "2026-08-26", completions: 30, checkouts: 5 }),
      ],
      "2026-08-26"
    );
    expect(trends.charted.map((c) => c.axis)).not.toContain("pricing");
    expect(trends.skipped.map((s) => s.axis)).not.toContain("pricing");
    const young = trends.counts.find((c) => c.axis === "pricing")!;
    // Glance line, then both arms' raw counts, never a rate.
    expect(young.text).toContain("*Report pricing* — since 24 Aug");
    expect(young.text).toContain("90 finished → 15 checkout → 0 paid");
    // Which side is dearer, DERIVED from the live catalogue rather than named.
    expect(young.text).toMatch(/\*Pricing A\* — (dearer|cheaper), base EUR/);
    // It must say how much data there is, why the window starts where it does,
    // and when the chart will appear — not just "not enough data".
    expect(young.text).toContain("no clear winner yet");
    expect(young.text).toMatch(/chart from \d/);
    expect(validFrom).toBe("2026-08-24");
  });

  it("names the date the trend chart will actually carry a line", () => {
    // MIN_TREND_DAYS days must have PASSED, and the digest always reports on
    // yesterday — so the run that first has a line is validFrom + 7, not + 6.
    const trends = buildAxisTrends(
      [
        ...rows("pricing", "A", { days: 1, lastDay: "2026-08-24", completions: 30, checkouts: 5 }),
        ...rows("pricing", "B", { days: 1, lastDay: "2026-08-24", completions: 30, checkouts: 5 }),
      ],
      "2026-08-24"
    );
    expect(trends.counts.find((c) => c.axis === "pricing")!.text).toContain("chart from 31 Aug");
  });

  it("refuses an axis whose smaller arm is too thin to trend", () => {
    const trends = buildAxisTrends(
      [
        ...rows("pricing", "A", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 2,
        }),
        // One finisher a day for three days: far below the floor.
        ...rows("pricing", "B", { days: 3, lastDay: "2026-09-30", completions: 1, checkouts: 0 }),
      ],
      "2026-09-30"
    );
    expect(trends.charted.map((c) => c.axis)).not.toContain("survey");
    const young = trends.counts.find((c) => c.axis === "pricing")!;
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
        // "Pricing B" sorts first but converts far worse.
        ...rows("pricing", "B", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 40,
          checkouts: 2,
        }),
        ...rows("pricing", "A", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 40,
          checkouts: 12,
        }),
      ],
      "2026-09-30"
    );
    const chart = trends.charted.find((c) => c.axis === "pricing")!;
    expect(chart.arms[0]).toBe("A");
    expect(chart.caption).toContain("Pricing A is genuinely ahead");
    expect(chart.caption).not.toContain("Pricing B is genuinely ahead");
    // The winner's gap reads as a gain, not a loss.
    expect(chart.caption).toMatch(/ahead \(\+\d/);
  });

  it("says so plainly when only one arm has data", () => {
    const trends = buildAxisTrends(
      rows("pricing", "A", { days: 30, lastDay: "2026-09-30", completions: 10, checkouts: 2 }),
      "2026-09-30"
    );
    const gap = trends.skipped.find((s) => s.axis === "pricing")!;
    expect(gap.caption).toContain("nothing to compare");
    expect(gap.caption).toContain("only Pricing A has data");
  });

  it("reads as English when NO arm has data", () => {
    // "only" used to be hoisted out of the one-arm branch, which made the
    // zero-arm caption read "no chart yet: only no arms have data".
    const trends = buildAxisTrends(
      rows("pricing", "A", { days: 30, lastDay: "2026-09-30", completions: 10, checkouts: 2 }),
      "2026-09-30"
    );
    for (const gap of trends.skipped) {
      expect(gap.caption).not.toContain("only no");
      expect(gap.caption).not.toMatch(/only no arms? have/);
    }
    // Pricing has the one arm this fixture supplies; landing has none at all, so
    // it is the axis that exercises the zero-arm branch.
    const oneArm = trends.skipped.find((s) => s.axis === "pricing")!;
    expect(oneArm.caption).toContain("only Pricing A has data");
    const noArm = trends.skipped.find((s) => s.axis === "landing")!;
    expect(noArm.caption).toContain("no arm has data");
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
        ...rows("pricing", "A", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 0,
        }),
        ...rows("pricing", "B", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 0,
        }),
      ],
      "2026-09-30"
    );
    const chart = trends.charted.find((c) => c.axis === "pricing")!;
    expect(chart.caption).toContain("Not enough to compare yet");
    expect(chart.caption).not.toContain("No clear winner");
    expect(chart.caption).not.toContain("genuinely ahead");
  });

  it("needs a full trailing window before any axis charts", () => {
    expect(MIN_TREND_DAYS).toBe(7);
  });
});
