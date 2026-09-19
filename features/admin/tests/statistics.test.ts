import { describe, expect, it } from "vitest";
import { formatSignalSummary, twoProportionSignal } from "@features/admin/server/statistics";

/**
 * `statistics.ts` had no test file, which is how the defect below survived while
 * feeding four surfaces: the daily Slack conversion digest, the experiment
 * registry, and both impact-comparison tabs.
 *
 * The two-proportion test here is a NORMAL APPROXIMATION. It is only valid with
 * roughly five or more successes AND five or more failures in every cell. The
 * guard, though, counted denominators only — `control + variant < 50` — so a
 * split with a huge sample and almost no conversions passed as measurable and
 * came back with a p-value and a confidence interval attached.
 *
 * That is not a rounding problem, it is a wrong answer with a number on it: the
 * reader sees a delta and an interval, reads "measured, no winner", and decides
 * the experiment. These pin the real production numbers that exposed it.
 */
describe("twoProportionSignal — the success-count floor", () => {
  it("refuses to judge the report-purchases split, which has 9 conversions total", () => {
    // Real numbers, 30 days to 2026-08-25: dark 5/145 vs white 4/187.
    // n = 332 clears the old sample floor easily; 4 successes does not clear the
    // approximation's own precondition.
    const signal = twoProportionSignal(145, 5, 187, 4);
    expect(signal.significance).toBe("insufficient-data");
    // And it must SAY so, rather than showing an interval the reader will trust.
    expect(formatSignalSummary(signal)).toContain("Insufficient");
  });

  it("still judges the checkout split, which has enough of both outcomes", () => {
    // Same window, one funnel step earlier: dark 15/145 vs white 30/187. Every
    // cell is comfortably above 5, so this one is legitimately measurable — the
    // fix must not silence the metric that actually has data.
    const signal = twoProportionSignal(145, 15, 187, 30);
    expect(signal.significance).not.toBe("insufficient-data");
    expect(signal.pValue).not.toBeNull();
    expect(signal.ciLow).not.toBeNull();
  });

  it("refuses a zero-conversion arm however large the other side is", () => {
    // The shape that nearly produced a false "significant lift": one arm with no
    // conversions at all reads as a huge, confident difference.
    const signal = twoProportionSignal(24, 0, 675, 91);
    expect(signal.significance).toBe("insufficient-data");
  });

  it("counts failures too, not just successes", () => {
    // Near-total conversion is the mirror image: 1 failure per arm is just as
    // invalid as 1 success, and a successes-only guard would wave this through.
    const signal = twoProportionSignal(100, 99, 100, 98);
    expect(signal.significance).toBe("insufficient-data");
  });

  it("keeps the original sample-size floor", () => {
    // 5 successes and 5 failures each, but only 20 observations in total.
    const signal = twoProportionSignal(10, 5, 10, 5);
    expect(signal.significance).toBe("insufficient-data");
  });

  it("still rejects impossible inputs", () => {
    expect(twoProportionSignal(0, 0, 10, 1).significance).toBe("insufficient-data");
    expect(twoProportionSignal(10, 11, 10, 1).significance).toBe("insufficient-data");
  });
});
