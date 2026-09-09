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

  /**
   * CHANGED 2026-09-09. These used to assert that "right now" and "currently" ADD the
   * month name to the search text. They anchor instead, and add nothing.
   *
   * The words mean current STATE, not a named month, and injecting "September 2026"
   * turned every such question into a question about September: "what is everyone
   * working on right now" returned the Google Search Console monthly total, whose title
   * contains the month the hint had just added. The hint also turned out to be redundant
   * where it did help — with the anchor alone, "how many signups currently" still
   * returns the September analytics row first, because the metric word does that work.
   */
  it("treats 'right now' and 'currently' as the current period, without naming it", () => {
    expect(expandRelativePeriods("what is our cost per customer right now", NOW)).toBe(
      "what is our cost per customer right now"
    );
    // Clamped to today, never the end of a month still running — the documented rule.
    expect(periodAnchor("what is our cost per customer right now", NOW)).toEqual({
      date: "2026-08-28",
      grain: "month",
    });
    expect(expandRelativePeriods("how many signups currently", NOW)).toBe(
      "how many signups currently"
    );
    expect(periodAnchor("how many signups currently", NOW)?.date).toBe("2026-08-28");
  });

  it("supplies the year a bare month name leaves out", () => {
    /**
     * CHANGED 2026-09-09, on measurement. This used to assert that "how did august go"
     * was left alone, on the reasoning that the month word alone already ranked August
     * first. Sweeping 162 numeric questions showed otherwise: "how many signups june"
     * and "what were our signups august" returned SEPTEMBER's figure, because with
     * nothing anchored the recency term simply picks the newest month.
     */
    expect(expandRelativePeriods("how did august go", NOW)).toBe("how did august go August 2026");
    expect(expandRelativePeriods("revenue?", NOW)).toBe("revenue?");
    expect(expandRelativePeriods("", NOW)).toBe("");
  });

  /**
   * FOUR GRAINS, BECAUSE THE CORPUS HAS FOUR. `week` and `alltime` were missing, and the
   * grain penalty treats "not the grain asked for" as a demotion -- so a chunk at a grain
   * no anchor could ever name was penalised on every question that anchored at all.
   *
   * Measured 2026-09-10: "how many visits did we get in the week ending 30 August 2026"
   * answered 206 (that Sunday) against the week's 2,477 -- a 12x understatement, with the
   * weekly row holding the HIGHEST content score in the result. And "how much have we
   * earned in total" returned the all-time row at rank 1, while "...in total currently"
   * -- one adverb more -- set a month anchor and deleted it from the top four.
   */
  it("reads a named week as a week, not as the day it ends on", () => {
    for (const q of [
      "how much revenue did we make in the week of 24 to 30 August 2026",
      "how many visits did we get in the week ending 30 August 2026",
      "what happened in the week beginning 24 August 2026",
    ] as const) {
      const a = periodAnchor(q, NOW);
      expect(a?.grain, `wrong grain for: ${q}`).toBe("week");
    }
    // The LAST date in the phrase is the week's end, which is how a weekly row is dated.
    expect(periodAnchor("the week of 24 to 30 August 2026", NOW)?.date).toBe("2026-08-30");
    // A plain day question is still a day.
    expect(periodAnchor("how many signups on 30 August 2026", NOW)?.grain).toBe("day");
  });

  it("reads a lifetime question as its own grain, whatever else is in the sentence", () => {
    for (const q of [
      "how much have we earned in total",
      "how much have we earned in total currently",
      "how many signups all time",
      "what have we made since launch",
      "how many reports altogether",
    ] as const) {
      expect(periodAnchor(q, NOW)?.grain, `wrong grain for: ${q}`).toBe("alltime");
    }
    // And a question that names a month is still a month question.
    expect(periodAnchor("how much revenue in June 2026", NOW)?.grain).toBe("month");
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
  it("never anchors on a future MONTH", () => {
    expect(periodAnchor("how many sessions in october 2026", NOW)?.date).toBe("2026-09-07");
    expect(periodAnchor("how are we doing this month", NOW)?.date).toBe("2026-09-07");
    expect(periodAnchor("revenue in january 2027", NOW)?.date).toBe("2026-09-07");
  });

  /**
   * A FUTURE DAY IS NOT THE SAME CASE. The clamp above is right because a month that has
   * not happened holds no numbers. A named future DAY routinely has a record -- 93 of
   * 299 calendar chunks are future-dated -- and once the recency decay became symmetric,
   * clamping made those unreachable: "the LoveIQ Sync on 6 January 2027" put the right
   * row at rank 46 even though its content score BEAT the winner's. Content preferred
   * the right answer and recency overruled it.
   */
  it("anchors on a future DAY the asker named, so the record is reachable", () => {
    expect(periodAnchor("the LoveIQ Sync on 6 January 2027", NOW)?.date).toBe("2027-01-06");
    expect(periodAnchor("what is scheduled for 2027-01-06", NOW)?.date).toBe("2027-01-06");
    // Still a day anchor, so the grain penalty aims at day rows.
    expect(periodAnchor("the LoveIQ Sync on 6 January 2027", NOW)?.grain).toBe("day");
  });

  /**
   * A DAY WRITTEN IN WORDS IS STILL A DAY.
   *
   * `dayFirst` needed a numeric day and no filler, so "the thirteenth of June 2026" fell
   * through to the month branch. Survivable while the grain penalty was a demotion; at
   * 0.8 it is a deletion -- measured 2026-09-10, four such questions put the correct day
   * row OUTSIDE THE TOP 400, while the same question written "13 June 2026" returned it
   * at rank 1. The month and year still matched, so the answer looked confident and was
   * about the wrong period.
   */
  it("reads a day spelled out in words, with or without 'of'", () => {
    for (const [q, want] of [
      ["how many signups on the thirteenth of June 2026", "2026-06-13"],
      ["how many signups on 13th of June 2026", "2026-06-13"],
      ["how many signups on 13 June 2026", "2026-06-13"],
      ["what happened on the third of January 2026", "2026-01-03"],
      ["revenue on the twenty-first of August 2026", "2026-08-21"],
      ["revenue on the thirty-first of August 2026", "2026-08-31"],
    ] as const) {
      const a = periodAnchor(q, NOW);
      expect(a?.date, `wrong anchor for: ${q}`).toBe(want);
      expect(a?.grain, `wrong grain for: ${q}`).toBe("day");
    }
    // A month question must still read as a month.
    expect(periodAnchor("how much revenue in June 2026", NOW)?.grain).toBe("month");
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
  /**
   * THE HALF THAT MUST NEVER CHANGE. "May" is an auxiliary verb and "march" a common
   * noun, so anchoring on them bare would silently re-rank questions about nothing of
   * the kind. They are recognised only after a preposition.
   */
  it("does not treat a month word used as ordinary English as a period", () => {
    expect(periodAnchor("how may we improve the report", NOW)).toBeNull();
    expect(periodAnchor("what is the march of progress on pricing", NOW)).toBeNull();
    expect(periodAnchor("we may need to change the pricing", NOW)).toBeNull();
  });

  /**
   * THE HALF THAT DID CHANGE, and why. Ten of the twelve month names are not English
   * words, and a bare one is how people actually ask — nobody says "June 2026" out
   * loud. Leaving them unanchored meant recency picked the newest month instead:
   * measured, "how many signups june" answered with September's figure.
   */
  it("anchors an unambiguous month name on its own", () => {
    expect(periodAnchor("how many page views in june", NOW)).toEqual({
      date: "2026-06-30",
      grain: "month",
    });
    expect(periodAnchor("what were our signups august", NOW)?.date).toBe("2026-08-31");
    // After a preposition, the two English words are months again.
    expect(periodAnchor("what happened in may", NOW)?.date).toBe("2026-05-31");
  });

  /**
   * A MONTH THAT HAS NOT ARRIVED IS LAST YEAR'S. Asked in September, "december" means
   * the December that happened, not the one three months away — a business question is
   * never about a month with no data in it.
   */
  it("reads a future-sounding month as the most recent one that happened", () => {
    expect(periodAnchor("how did december go", NOW)?.date).toBe("2025-12-31");
    expect(periodAnchor("signups in october", NOW)?.date).toBe("2025-10-31");
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
