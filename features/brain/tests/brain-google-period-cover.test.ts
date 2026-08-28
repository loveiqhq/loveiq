import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { windowCoveringWholePeriods } from "@features/brain/server/ingest/google";

/**
 * The defect these guard was measured in production, not imagined: on 2026-08-28
 * the gsc monthly chunk read 23 clicks / 330 impressions over "18–26 August" while
 * August's own daily chunks summed to 70 / 1,271. Weekly and monthly rows are
 * totalled from the FETCHED window, so a 10-day window mid-month yields a 10-day
 * "month".
 */
describe("windowCoveringWholePeriods", () => {
  it("reaches back to the 1st when the window starts mid-month", () => {
    // 2026-08-28 minus 10 days = 2026-08-18, which is mid-month AND mid-week.
    // The fetch must instead start 2026-08-01 (27 days back) at the latest.
    const days = windowCoveringWholePeriods(10, new Date("2026-08-28T04:47:00Z"));
    const start = new Date("2026-08-28T04:47:00Z");
    start.setUTCDate(start.getUTCDate() - days);
    expect(start.toISOString().slice(0, 10) <= "2026-08-01").toBe(true);
  });

  it("covers the PREVIOUS month when the window straddles a boundary", () => {
    // On the 5th, a 10-day window starts 26 Sept and would rewrite September —
    // a complete month — from five days. It must reach 2026-09-01.
    const when = new Date("2026-10-05T04:47:00Z");
    const days = windowCoveringWholePeriods(10, when);
    const start = new Date(when);
    start.setUTCDate(start.getUTCDate() - days);
    expect(start.toISOString().slice(0, 10) <= "2026-09-01").toBe(true);
  });

  it("lands EXACTLY on a period start — never one day before it", () => {
    // Overshooting by a day is not harmless: a window starting 2026-07-31 pulls one
    // day of July, and July's monthly total is then rebuilt from that single day,
    // overwriting a complete month. That is this same bug displaced one month back,
    // so the boundary has to be exact, not merely "at least far enough".
    for (const iso of [
      "2026-08-28T04:47:00Z",
      "2026-01-03T04:47:00Z",
      "2026-03-01T04:47:00Z",
      "2026-12-31T04:47:00Z",
      "2026-10-05T23:59:00Z",
      "2026-02-29T00:00:00Z",
    ]) {
      const when = new Date(iso);
      const start = new Date(when);
      start.setUTCDate(start.getUTCDate() - windowCoveringWholePeriods(10, when));
      const isMonthStart = start.getUTCDate() === 1;
      const isMonday = start.getUTCDay() === 1;
      expect(
        isMonthStart || isMonday,
        `${iso} -> ${start.toISOString().slice(0, 10)} (dow ${start.getUTCDay()}) is mid-period`
      ).toBe(true);
    }
  });

  it("is independent of the time of day the cron happens to fire", () => {
    // The 04:47 schedule must not produce a different window than a manual midday run.
    const a = windowCoveringWholePeriods(10, new Date("2026-08-28T00:01:00Z"));
    const b = windowCoveringWholePeriods(10, new Date("2026-08-28T23:59:00Z"));
    expect(a).toBe(b);
  });

  it("never SHRINKS a window — a 480-day backfill stays at least 480", () => {
    expect(windowCoveringWholePeriods(480, new Date("2026-08-28T04:47:00Z"))).toBeGreaterThanOrEqual(
      480
    );
  });

  it("costs at most about a month of extra days", () => {
    // Guards against an accidental unbounded widening that would re-fetch history
    // every night and blow the cron's time budget.
    for (const d of [1, 5, 10, 30]) {
      const got = windowCoveringWholePeriods(d, new Date("2026-08-28T04:47:00Z"));
      expect(got).toBeLessThanOrEqual(d + 31);
    }
  });
});
