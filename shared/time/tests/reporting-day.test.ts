import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORTING_TIME_ZONE, reportingDay } from "@shared/time/reporting-day";

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
