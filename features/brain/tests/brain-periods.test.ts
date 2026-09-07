import { describe, expect, it } from "vitest";
import { expandRelativePeriods, periodAnchor } from "@features/brain/server/periods";

// A Friday, so week/month/year boundaries are all mid-period.
const NOW = new Date("2026-08-28T10:00:00Z");

describe("expandRelativePeriods", () => {
  /**
   * The regression this exists for: measured on the real corpus, "how are we
   * doing this month" returned monthly:2026-05, :2026-07 and :2026-06 and NOT
   * :2026-08 — the current month was not in the top 14 at all. After expansion,
   * analytics/monthly:2026-08 ranks 1 and every slot is August.
   */
  it("names the current month, which is the question that was answered wrongly", () => {
    expect(expandRelativePeriods("how are we doing this month", NOW)).toContain("August 2026");
  });

  it("names the previous month without also naming the current one", () => {
    const out = expandRelativePeriods("how did we do last month", NOW);
    expect(out).toContain("July 2026");
    expect(out).not.toContain("August 2026");
  });

  it("uses the ISO week label the chunks carry", () => {
    expect(expandRelativePeriods("how was last week", NOW)).toContain("2026-W34");
    expect(expandRelativePeriods("how is this week going", NOW)).toContain("2026-W35");
  });

  it("expands yesterday to both the long date and the ISO date", () => {
    const out = expandRelativePeriods("how did we do yesterday", NOW);
    expect(out).toContain("Thursday 27 August 2026");
    expect(out).toContain("2026-08-27");
  });

  it("treats 'right now' and 'currently' as the current period", () => {
    expect(expandRelativePeriods("what is our cost per customer right now", NOW)).toContain(
      "August 2026"
    );
    expect(expandRelativePeriods("how many signups currently", NOW)).toContain("August 2026");
  });

  it("leaves a question that already names its period untouched", () => {
    // This one already worked: monthly:2026-08 ranked 1 at score 1.340.
    expect(expandRelativePeriods("how did august go", NOW)).toBe("how did august go");
    expect(expandRelativePeriods("revenue?", NOW)).toBe("revenue?");
    expect(expandRelativePeriods("", NOW)).toBe("");
  });

  it("crosses a year boundary correctly", () => {
    const jan = new Date("2026-01-05T10:00:00Z");
    expect(expandRelativePeriods("last month", jan)).toContain("December 2025");
    expect(expandRelativePeriods("last year", jan)).toContain("2025");
    // 2026-01-05 is in ISO week 2; the week before is 2026-W01.
    expect(expandRelativePeriods("last week", jan)).toContain("2026-W01");
  });

  it("crosses a month boundary on the 1st", () => {
    const first = new Date("2026-03-01T10:00:00Z");
    expect(expandRelativePeriods("this month", first)).toContain("March 2026");
    expect(expandRelativePeriods("last month", first)).toContain("February 2026");
    expect(expandRelativePeriods("yesterday", first)).toContain("2026-02-28");
  });

  it("handles a leap day", () => {
    const leap = new Date("2024-03-01T10:00:00Z");
    expect(expandRelativePeriods("yesterday", leap)).toContain("2024-02-29");
  });
});

describe("periodAnchor — where the recency term measures from", () => {
  const NOW = new Date("2026-09-07T10:00:00.000Z");

  it("returns nothing when the question names no period, so recency is untouched", () => {
    expect(periodAnchor("what did we decide about pricing", NOW)).toBeNull();
    expect(periodAnchor("who is on the team", NOW)).toBeNull();
  });

  it("anchors an explicit month and year to that month's last day", () => {
    expect(periodAnchor("how many sessions in june 2026", NOW)?.date).toBe("2026-06-30");
    expect(periodAnchor("what did we spend in february 2026", NOW)?.date).toBe("2026-02-28");
    expect(periodAnchor("how many users in december 2025", NOW)?.date).toBe("2025-12-31");
  });

  it("reads the ISO period key the corpus itself uses", () => {
    expect(periodAnchor("what happened in 2026-04", NOW)?.date).toBe("2026-04-30");
  });

  /**
   * The clamp. October has not happened, so anchoring on its last day would measure
   * every row we hold as distant and rank on nothing but distance. Clamped to today it
   * degrades to exactly the unanchored behaviour, which is the honest answer to a
   * question about a month with no data.
   */
  it("never anchors in the future", () => {
    expect(periodAnchor("how many sessions in october 2026", NOW)?.date).toBe("2026-09-07");
    expect(periodAnchor("how are we doing this month", NOW)?.date).toBe("2026-09-07");
  });

  it("anchors the relative expressions to the same dates it already hints", () => {
    expect(periodAnchor("how did last month go", NOW)?.date).toBe("2026-08-31");
    expect(periodAnchor("what happened yesterday", NOW)?.date).toBe("2026-09-06");
    expect(periodAnchor("how did last year go", NOW)?.date).toBe("2025-12-31");
  });

  /**
   * THE FALSE POSITIVE THIS AVOIDS. "may" is an auxiliary verb and "march" a common
   * noun, so detecting a bare month name would anchor questions that name no period at
   * all and silently re-rank them. A year makes it unambiguous, and the bare-month case
   * measured fine without an anchor.
   */
  it("does not treat a month word used as ordinary English as a period", () => {
    expect(periodAnchor("how may we improve the report", NOW)).toBeNull();
    expect(periodAnchor("what is the march of progress on pricing", NOW)).toBeNull();
    expect(periodAnchor("how many page views in june", NOW)).toBeNull();
  });

  it("leaves the search-string expansion it shares code with unchanged", () => {
    expect(expandRelativePeriods("how many sessions in june 2026", NOW)).toBe(
      "how many sessions in june 2026"
    );
  });
});

describe("periodAnchor — how coarse the named period is", () => {
  const NOW = new Date("2026-09-07T10:00:00.000Z");

  /**
   * THE DEFECT THIS EXISTS FOR. Without a grain, "how many sessions in june 2026"
   * answered with the week of 22-28 June — 90 sessions against the month's 3,969.
   * The right month, the wrong number, stated with equal confidence. Measured across
   * nine months, the monthly total led only 3 times.
   */
  it("calls a named month a month", () => {
    expect(periodAnchor("how many sessions in june 2026", NOW)?.grain).toBe("month");
    expect(periodAnchor("how did last month go", NOW)?.grain).toBe("month");
    expect(periodAnchor("what happened in 2026-04", NOW)?.grain).toBe("month");
  });

  it("calls a named day a day, so a month total cannot displace it", () => {
    expect(periodAnchor("what happened yesterday", NOW)?.grain).toBe("day");
    expect(periodAnchor("what happened today", NOW)?.grain).toBe("day");
  });

  /**
   * A period still running clamps its DATE to today but keeps its month GRAIN — the
   * question is still about a month, and answering it with one day of that month would
   * be the same wrong-number failure.
   */
  it("keeps the month grain even when the date is clamped to today", () => {
    const a = periodAnchor("how are we doing this month", NOW);
    expect(a?.date).toBe("2026-09-07");
    expect(a?.grain).toBe("month");
  });
});

describe("periodAnchor — a single day is not the month that contains it", () => {
  const NOW = new Date("2026-09-07T10:00:00.000Z");

  /**
   * THE BUG THIS EXISTS FOR, found by a probe rather than by review. "27 june 2026"
   * CONTAINS "june 2026", so a month-only detector called it a month — and the grain
   * penalty then demoted the very day being asked about, answering a question about one
   * day with the whole month's total. The day patterns are therefore tested first, and
   * the ordering is the fix.
   */
  it("reads a day written before the month", () => {
    expect(periodAnchor("how many sessions on 27 june 2026", NOW)).toEqual({
      date: "2026-06-27",
      grain: "day",
    });
  });

  it("reads a day written after the month, with or without a comma", () => {
    expect(periodAnchor("how many sessions on june 27, 2026", NOW)?.date).toBe("2026-06-27");
    expect(periodAnchor("how many sessions on june 27 2026", NOW)?.grain).toBe("day");
  });

  it("reads an ordinal day", () => {
    expect(periodAnchor("how many sessions on 3rd may 2026", NOW)).toEqual({
      date: "2026-05-03",
      grain: "day",
    });
  });

  it("reads a full ISO date as a day and an ISO month as a month", () => {
    expect(periodAnchor("what happened on 2026-06-27", NOW)?.grain).toBe("day");
    expect(periodAnchor("what happened in 2026-04", NOW)?.grain).toBe("month");
  });

  it("still reads a bare month and year as a month", () => {
    expect(periodAnchor("how many sessions in june 2026", NOW)).toEqual({
      date: "2026-06-30",
      grain: "month",
    });
  });
});
