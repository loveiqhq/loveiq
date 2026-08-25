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
  it("never charts the concluded paywall experiment", () => {
    // Three independent layers, because the way this bug actually happens is a
    // developer writing `Object.keys(AXIS_TITLES)` — which contains `paywall`.
    expect([...CHART_AXES]).not.toContain("paywall");
    expect([...CHART_AXES]).toEqual(["survey", "pricing", "landing"]);

    // Even if the RPC regressed and started emitting paywall rows, nothing
    // reaches Slack.
    const trends = buildAxisTrends(
      [
        ...rows("paywall", "treatment", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 20,
          checkouts: 4,
        }),
        ...rows("paywall", "control", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 20,
          checkouts: 4,
        }),
      ],
      "2026-09-30"
    );
    expect(trends.charted).toHaveLength(0);
    expect(trends.skipped.map((s) => s.axis)).not.toContain("paywall");
  });

  it("charts an axis with enough history and computes the rate from the rows", () => {
    const trends = buildAxisTrends(
      [
        ...rows("survey", "white", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 2,
          paid: 1,
        }),
        ...rows("survey", "dark", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 1,
        }),
      ],
      "2026-09-30"
    );
    const chart = trends.charted.find((c) => c.axis === "survey");
    expect(chart).toBeDefined();
    // 30 days x 10 = 300 completions, x2 = 60 checkouts => 20%.
    expect(chart!.headline).toContain("60/300 = 20%");
    expect(chart!.headline).toContain("30/300 = 10%");
    // Higher-volume arm first, so colour is stable between runs.
    expect(chart!.arms[0]).toBe("white");
    // Purchases are reported as a COUNT and never drawn as a second line.
    expect(chart!.caption).toMatch(/[Pp]urchases/);
  });

  it("only calls the purchase count too small when it actually is", () => {
    // The claim used to be unconditional, which is the one thing this module is
    // not allowed to do: it would have kept saying "too few for a line to mean
    // anything" after purchases grew past the point where a line works.
    const many = buildAxisTrends(
      [
        ...rows("survey", "white", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 5,
          paid: 3,
        }),
        ...rows("survey", "dark", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 4,
          paid: 2,
        }),
      ],
      "2026-09-30"
    );
    const chart = many.charted.find((c) => c.axis === "survey")!;
    // 30 days x (3 + 2) = 150 purchases: plenty.
    expect(chart.caption).toContain("150 purchases");
    expect(chart.caption).not.toContain("too few");

    // And the shape it was written for. 20 purchases is ~2 per arm per week,
    // which draws a flat zero with spikes — so the line stays undrawn and says
    // why. Deliberately ABOVE the first threshold I picked (MIN_CELL_COUNT * 2 =
    // 10) and below the real one, so this test fails if that mistake comes back;
    // a fixture with zero purchases passed under either and proved nothing.
    const few = buildAxisTrends(
      [
        ...rows("survey", "white", {
          days: 10,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 5,
          paid: 1,
        }),
        ...rows("survey", "dark", {
          days: 10,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 4,
          paid: 1,
        }),
      ],
      "2026-09-30"
    );
    const fewChart = few.charted.find((c) => c.axis === "survey")!;
    expect(fewChart.caption).toContain("20 in this window is too few");
  });

  it("refuses an axis whose comparison is younger than the trailing window", () => {
    // Pricing's arms only became like-for-like on its repricing date.
    const validFrom = AXIS_VALID_FROM.pricing!.day;
    const trends = buildAxisTrends(
      [
        ...rows("pricing", "A", { days: 3, lastDay: "2026-08-26", completions: 30, checkouts: 5 }),
        ...rows("pricing", "B", { days: 3, lastDay: "2026-08-26", completions: 30, checkouts: 5 }),
      ],
      "2026-08-26"
    );
    expect(trends.charted.map((c) => c.axis)).not.toContain("pricing");
    const gap = trends.skipped.find((s) => s.axis === "pricing")!;
    // It must say how much data there is, why the window starts where it does,
    // and roughly when the chart will appear — not just "not enough data".
    expect(gap.caption).toContain("3 days");
    expect(gap.caption).toContain("prices were changed");
    expect(gap.caption).toMatch(/should appear around/);
    expect(validFrom).toBe("2026-08-24");
  });

  it("refuses an axis whose smaller arm is too thin to trend", () => {
    const trends = buildAxisTrends(
      [
        ...rows("survey", "white", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 2,
        }),
        // One finisher a day for three days: far below the floor.
        ...rows("survey", "dark", { days: 3, lastDay: "2026-09-30", completions: 1, checkouts: 0 }),
      ],
      "2026-09-30"
    );
    expect(trends.charted.map((c) => c.axis)).not.toContain("survey");
    const gap = trends.skipped.find((s) => s.axis === "survey")!;
    expect(gap.caption).toContain(`needs ${MIN_ARM_COMPLETIONS}`);
    expect(gap.caption).toContain("3 finished surveys");
  });

  it("says so plainly when only one arm has data", () => {
    const trends = buildAxisTrends(
      rows("survey", "white", { days: 30, lastDay: "2026-09-30", completions: 10, checkouts: 2 }),
      "2026-09-30"
    );
    const gap = trends.skipped.find((s) => s.axis === "survey")!;
    expect(gap.caption).toContain("nothing to compare");
    expect(gap.caption).toContain("only White survey has data");
  });

  it("reads as English when NO arm has data", () => {
    // "only" used to be hoisted out of the one-arm branch, which made the
    // zero-arm caption read "no chart yet: only no arms have data".
    const trends = buildAxisTrends(
      rows("survey", "white", { days: 30, lastDay: "2026-09-30", completions: 10, checkouts: 2 }),
      "2026-09-30"
    );
    for (const gap of trends.skipped) {
      expect(gap.caption).not.toContain("only no");
      expect(gap.caption).not.toMatch(/only no arms? have/);
    }
    const pricing = trends.skipped.find((s) => s.axis === "pricing")!;
    expect(pricing.caption).toContain("no arm has data");
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
        ...rows("survey", "white", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 0,
        }),
        ...rows("survey", "dark", {
          days: 30,
          lastDay: "2026-09-30",
          completions: 10,
          checkouts: 0,
        }),
      ],
      "2026-09-30"
    );
    const chart = trends.charted.find((c) => c.axis === "survey")!;
    expect(chart.caption).toContain("Not enough to compare yet");
    expect(chart.caption).not.toContain("No clear winner");
    expect(chart.caption).not.toContain("genuinely ahead");
  });

  it("needs a full trailing window before any axis charts", () => {
    expect(MIN_TREND_DAYS).toBe(7);
  });
});
