import { describe, expect, it } from "vitest";
import { expandRelativePeriods } from "@features/brain/server/periods";

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
