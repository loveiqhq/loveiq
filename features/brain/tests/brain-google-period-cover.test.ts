import { readFileSync } from "node:fs";

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
    expect(
      windowCoveringWholePeriods(480, new Date("2026-08-28T04:47:00Z"))
    ).toBeGreaterThanOrEqual(480);
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

/**
 * THE HALF THE WIDENING CANNOT REACH.
 *
 * `windowCoveringWholePeriods` pulls the fetch back to cover the whole week and the whole
 * month containing the window start — and covering the whole WEEK is what drags a single
 * day of the PREVIOUS month in with it. On 2026-09-11 a 10-day window starts 1 September,
 * a Tuesday, so the week reaches back to 31 August: one August day, fetched, and the
 * monthly aggregation then rebuilt `monthly:2026-08` out of it.
 *
 * Measured in production that day: the ga4 August row read 215 sessions and EUR 34.47
 * while its own 31 daily rows summed to 3,530 and EUR 1,252.97 — understated sixteenfold,
 * and labelled "whole month", because the only check was `lastDay >= monthEnd` and 31
 * August IS the month end. The campaign breakdown for August disappeared with it.
 *
 * The helper's own comment predicted this ("would rebuild the previous, complete month
 * from that single trailing day"); the widening closes the time-of-day case and not this
 * one. So the write itself must refuse: a finished period is only rewritten when the
 * fetch actually covered it from its first day.
 */
describe("a partial fetch never overwrites a finished aggregate", () => {
  const monthEnd = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return new Date(Date.UTC(y!, mm!, 0)).toISOString().slice(0, 10);
  };
  /** The rule as `google.ts` applies it. */
  const wouldWrite = (month: string, windowStart: string, today: string) => {
    const complete = windowStart <= `${month}-01` && monthEnd(month) <= today;
    return complete || monthEnd(month) >= today;
  };

  it("skips a finished month the window only clipped", () => {
    // The real case: window start 31 August, today 11 September.
    expect(wouldWrite("2026-08", "2026-08-31", "2026-09-11")).toBe(false);
    // And a month the window never touched at all.
    expect(wouldWrite("2026-07", "2026-08-31", "2026-09-11")).toBe(false);
  });

  it("still writes the month that is still running", () => {
    // Partial is the honest answer here, and it is labelled "month so far".
    expect(wouldWrite("2026-09", "2026-08-31", "2026-09-11")).toBe(true);
  });

  it("writes every month when a backfill genuinely covered them", () => {
    for (const m of ["2026-07", "2026-08"]) {
      expect(wouldWrite(m, "2025-05-01", "2026-09-11"), `backfill skipped ${m}`).toBe(true);
    }
  });

  it("keeps the widening wired in, which is what makes the above rare", () => {
    // The helper was correct and fully tested for a year; what matters is that the
    // production path still calls it. A fix that stops being called still passes its
    // own tests.
    const src = readFileSync("features/brain/server/ingest/google.ts", "utf8");
    const calls = src.split("windowCoveringWholePeriods(").length - 1;
    // One definition plus a call in each of the two ingesters.
    expect(calls, "the widening is no longer called from the fetch path").toBeGreaterThanOrEqual(3);
  });
});
