import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REPORTING_TIME_ZONE,
  isReportingMonday,
  isoWeekKey,
  reportingDay,
  reportingDayStart,
  reportingHour,
} from "@shared/time/reporting-day";

/**
 * Fixed 2026-08-28. Comparing GA4 against our own visitor counter gave ratios of
 * 20%, 45%, 74%, 89% and 135% on five consecutive days. 135% is impossible: our
 * counter is written server-side and consent-independent, so it is a strict
 * superset of anything GA4 can see. The GA4 property reports in Europe/Berlin and
 * `funnel_event.day` was UTC, so visits between 22:00 and 24:00 UTC were filed a
 * day earlier than GA4 filed them.
 */
describe("reportingDay", () => {
  it("reports in Europe/Berlin", () => {
    expect(REPORTING_TIME_ZONE).toBe("Europe/Berlin");
  });

  it("files a late-evening UTC visit on the NEXT day, as GA4 does (summer, UTC+2)", () => {
    // 22:30 UTC on 28 Aug is already 00:30 on 29 Aug in Berlin. This is the exact
    // two-hour window that produced the impossible ratio.
    expect(reportingDay(new Date("2026-08-28T22:30:00Z"))).toBe("2026-08-29");
    // ...while the old UTC bucketing would have said the 28th.
    expect(new Date("2026-08-28T22:30:00Z").toISOString().slice(0, 10)).toBe("2026-08-28");
  });

  it("follows DST rather than a fixed offset (winter, UTC+1)", () => {
    // 23:30 UTC in January is 00:30 the next day in Berlin — one hour, not two.
    expect(reportingDay(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
    // An hour earlier is still the same Berlin day, which a fixed +2 would get wrong.
    expect(reportingDay(new Date("2026-01-15T22:30:00Z"))).toBe("2026-01-15");
  });

  it("agrees with UTC during the middle of the day", () => {
    expect(reportingDay(new Date("2026-08-28T12:00:00Z"))).toBe("2026-08-28");
  });

  it("always returns a plain YYYY-MM-DD, because it is written to a DATE column", () => {
    for (const iso of ["2026-01-01T00:00:00Z", "2026-08-28T22:59:59Z", "2026-12-31T23:59:59Z"]) {
      expect(reportingDay(new Date(iso))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("reports the Berlin hour, not the UTC hour", () => {
    // Summer: Berlin is UTC+2.
    expect(reportingHour(new Date("2026-09-15T07:17:00Z"))).toBe(9);
    // Winter: UTC+1. The same wall-clock intent needs a different UTC hour,
    // which is the whole reason a fixed getUTCHours() gate drifts.
    expect(reportingHour(new Date("2026-01-15T08:30:00Z"))).toBe(9);
    expect(reportingHour(new Date("2026-01-15T07:30:00Z"))).toBe(8);
  });

  it("rolls the hour past midnight Berlin while UTC is still the day before", () => {
    // 23:30 UTC on the 14th is 01:30 on the 15th in Berlin. The hour and the
    // day have to agree about which day it is, or a once-a-day claim and the
    // gate that guards it disagree.
    const t = new Date("2026-09-14T23:30:00Z");
    expect(reportingHour(t)).toBe(1);
    expect(reportingDay(t)).toBe("2026-09-15");
  });

  it("keeps the dedup cookie and the funnel_event row on the SAME clock", () => {
    /**
     * The one with teeth. `proxy.ts` compares the `liq_dv` cookie against today's
     * day and, on a mismatch, flags a new daily visit that `recordVisit.ts` then
     * writes as a `funnel_event` row. If those two computed the day in different
     * timezones, every visitor in the offset window would be counted twice a day,
     * every day — silently inflating the denominator of the visitor→survey CVR.
     */
    for (const file of ["proxy.ts", "shared/observability/recordVisit.ts"]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, `${file} must use the shared helper`).toContain("reportingDay()");
      expect(src, `${file} still buckets by UTC date`).not.toMatch(
        /(day|visitDay)\s*[:=]\s*new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/
      );
    }
  });
});

describe("reportingDayStart", () => {
  const utcISO = (day: string) => reportingDayStart(day).toISOString();

  it("starts a summer day at 22:00 UTC the evening before (CEST, UTC+2)", () => {
    expect(utcISO("2026-07-15")).toBe("2026-07-14T22:00:00.000Z");
  });

  it("starts a winter day at 23:00 UTC the evening before (CET, UTC+1)", () => {
    expect(utcISO("2026-12-15")).toBe("2026-12-14T23:00:00.000Z");
  });

  it("is not UTC midnight — the bug this exists to prevent", () => {
    // `new Date("2026-07-15T00:00:00Z")` is 02:00 in Berlin, so a window built
    // that way loses two hours off one end of the day and gains two on the other.
    expect(utcISO("2026-07-15")).not.toBe("2026-07-15T00:00:00.000Z");
  });

  it("handles the spring changeover, where the offset moves during the day", () => {
    // Clocks go forward 02:00 -> 03:00 on 2026-03-29. The day still begins at
    // the CET offset in force at midnight, not the CEST one in force by noon.
    expect(utcISO("2026-03-29")).toBe("2026-03-28T23:00:00.000Z");
  });

  it("handles the autumn changeover", () => {
    // Clocks go back 03:00 -> 02:00 on 2026-10-25; midnight is still CEST.
    expect(utcISO("2026-10-25")).toBe("2026-10-24T22:00:00.000Z");
  });

  it("round-trips: the day a day-start belongs to is that same day", () => {
    for (const day of ["2026-01-01", "2026-03-29", "2026-07-15", "2026-10-25", "2026-12-31"]) {
      expect(reportingDay(reportingDayStart(day))).toBe(day);
      // And one millisecond earlier belongs to the day before.
      expect(reportingDay(new Date(reportingDayStart(day).getTime() - 1))).not.toBe(day);
    }
  });
});

/**
 * A weekly post gated on the UTC weekday fires on Sunday night for two hours of
 * every summer week, and then again on Monday. Berlin is +1 or +2 depending on
 * the season, so a fixed offset is wrong for half the year and wrong on both
 * changeover nights.
 */
describe("isReportingMonday", () => {
  it("follows Berlin, not UTC, at both ends of the day", () => {
    // Sunday in UTC, already Monday in Berlin.
    expect(isReportingMonday(new Date("2026-09-20T22:30:00Z"))).toBe(true);
    // Monday in UTC, already Tuesday in Berlin.
    expect(isReportingMonday(new Date("2026-09-21T22:30:00Z"))).toBe(false);
    // Unambiguous cases.
    expect(isReportingMonday(new Date("2026-09-21T08:00:00Z"))).toBe(true);
    expect(isReportingMonday(new Date("2026-09-22T08:00:00Z"))).toBe(false);
  });
});

describe("isoWeekKey", () => {
  it("claims one key per week, stable across the whole Berlin day", () => {
    // 00:30 and 09:30 Berlin on the same Monday are different UTC days and must
    // still produce the same key, or the weekly post claims twice.
    expect(isoWeekKey(new Date("2026-09-20T22:30:00Z"))).toBe(
      isoWeekKey(new Date("2026-09-21T07:30:00Z"))
    );
  });

  it("puts a week in the year containing its Thursday", () => {
    /**
     * ISO weeks belong to the year of their Thursday, so the last days of
     * December can be week 1 of the NEXT year and the first days of January can
     * be week 52 or 53 of the PREVIOUS one. "Weeks since 1 January" gets that
     * wrong and would let a new-year post claim a key already used.
     */
    expect(isoWeekKey(new Date("2026-12-31T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
  });

  it("is shaped so a claim key sorts and reads", () => {
    expect(isoWeekKey(new Date("2026-09-21T08:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
  });
});
