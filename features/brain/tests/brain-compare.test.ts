import { describe, expect, it } from "vitest";
import {
  bucketKey,
  bucketLength,
  bucketRows,
  parseComparePeriod,
  renderComparison,
  type DayRow,
} from "@features/brain/server/compare";

const day = (d: string, extra: Record<string, unknown> = {}): DayRow => ({
  day: d,
  unique_visitors: 10,
  revenue: 5,
  ...extra,
});

describe("bucketKey", () => {
  it("puts a week on its Monday, so a week means one thing to everyone", () => {
    // 2026-09-12 is a Saturday; 2026-09-13 a Sunday. Both belong to Monday the 7th —
    // Sunday is the trap, because getUTCDay() calls it 0.
    expect(bucketKey("2026-09-12", "week")).toBe("2026-09-07");
    expect(bucketKey("2026-09-13", "week")).toBe("2026-09-07");
    expect(bucketKey("2026-09-14", "week")).toBe("2026-09-14");
  });

  it("buckets a month by its calendar month, and a day by itself", () => {
    expect(bucketKey("2026-09-12", "month")).toBe("2026-09");
    expect(bucketKey("2026-09-12", "day")).toBe("2026-09-12");
  });

  it("knows how long a month is, including February in a leap year", () => {
    expect(bucketLength("2026-09", "month")).toBe(30);
    expect(bucketLength("2026-02", "month")).toBe(28);
    expect(bucketLength("2028-02", "month")).toBe(29);
    expect(bucketLength("2026-09-07", "week")).toBe(7);
  });
});

describe("bucketRows — summing days without inventing what is missing", () => {
  /**
   * THE ONE THAT COSTS MONEY TO GET WRONG.
   *
   * Ad spend is only known inside the window GA4 covers; a day outside it carries no
   * `ad_spend` key at all, which means UNKNOWN. Summing the days that do have it and
   * presenting the total as the period's spend understates spend, which overstates
   * profit — the direction that is expensive to believe. The corpus builder already paid
   * for this lesson: it published "Net: EUR 291.68" for a month that actually lost
   * several hundred.
   */
  it("reports spend as unknown when any day in the bucket has none, never as a partial sum", () => {
    const [b] = bucketRows(
      [
        day("2026-09-01", { ad_spend: 100 }),
        day("2026-09-02", { ad_spend: 100 }),
        day("2026-09-03"), // outside GA4's window
      ],
      "month"
    );
    expect(b.adSpend).toBeNull();
    expect(b.uncoveredSpendDays).toBe(1);
    // The other totals are unaffected — one unknown column must not void the rest.
    expect(b.totals.unique_visitors).toBe(30);
  });

  it("sums spend when every day is covered", () => {
    const [b] = bucketRows(
      [day("2026-09-01", { ad_spend: 100 }), day("2026-09-02", { ad_spend: 50.5 })],
      "month"
    );
    expect(b.adSpend).toBe(150.5);
    expect(b.uncoveredSpendDays).toBe(0);
  });

  it("marks a bucket partial when it holds fewer days than the calendar does", () => {
    // Three days of September summed against a full month reads as a collapse unless
    // the bucket says it is three days.
    const [b] = bucketRows([day("2026-09-01"), day("2026-09-02"), day("2026-09-03")], "month");
    expect(b.partial).toBe(true);
    expect(b.days).toBe(3);
  });

  it("does not mark a full week partial", () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      day(`2026-09-${String(i + 7).padStart(2, "0")}`)
    );
    const [b] = bucketRows(rows, "week");
    expect(b.partial).toBe(false);
  });

  it("gives an unparseable day its own bucket instead of throwing", () => {
    // `toISOString()` on an invalid Date raises, and this runs while rendering an answer,
    // so one malformed row would have cost the caller the whole period. Every `day` comes
    // from a Postgres date column, which is why the throw would have been a surprise.
    expect(bucketKey("not-a-date", "week")).toBe("not-a-date");
    expect(() => bucketRows([day("not-a-date")], "week")).not.toThrow();
  });
});

describe("parseComparePeriod", () => {
  it("reads `previous` as the equally-long window ending the day before", () => {
    const r = parseComparePeriod("previous", { since: "2026-08-01", until: "2026-08-31" });
    expect(r).toEqual({ period: { since: "2026-07-01", until: "2026-07-31" } });
  });

  it("keeps `previous` the same LENGTH, even when the previous month is shorter", () => {
    // March has 31 days; the 31 days before it reach back into January. Snapping to
    // "the previous calendar month" would compare 31 days against 28 and call the
    // difference a change in the business.
    const r = parseComparePeriod("previous", { since: "2026-03-01", until: "2026-03-31" });
    expect(r).toEqual({ period: { since: "2026-01-29", until: "2026-02-28" } });
  });

  it("reads an explicit range", () => {
    expect(
      parseComparePeriod("2026-07-01..2026-07-31", { since: "2026-08-01", until: "2026-08-31" })
    ).toEqual({ period: { since: "2026-07-01", until: "2026-07-31" } });
  });

  it("refuses a backwards range and an unparseable one, saying which", () => {
    expect(parseComparePeriod("2026-07-31..2026-07-01", { since: "a", until: "b" })).toHaveProperty(
      "error"
    );
    expect(parseComparePeriod("last month", { since: "a", until: "b" })).toHaveProperty("error");
  });
});

describe("renderComparison", () => {
  const base = { since: "2026-08-01", until: "2026-08-31" };

  it("says when the two periods are different lengths", () => {
    const out = renderComparison(
      { period: base, rows: [day("2026-08-01", { ad_spend: 1 })] },
      {
        period: { since: "2026-09-01", until: "2026-09-10" },
        rows: [day("2026-09-01", { ad_spend: 1 })],
      }
    );
    expect(out).toContain("DIFFERENT LENGTHS");
    expect(out).toContain("not like-for-like");
  });

  it("does not cry unequal when they match", () => {
    const out = renderComparison(
      { period: base, rows: [day("2026-08-01", { ad_spend: 1 })] },
      {
        period: { since: "2026-07-01", until: "2026-07-31" },
        rows: [day("2026-07-01", { ad_spend: 1 })],
      }
    );
    expect(out).not.toContain("DIFFERENT LENGTHS");
  });

  it("refuses to subtract two spends when either side has an uncovered day", () => {
    const out = renderComparison(
      { period: base, rows: [day("2026-08-01", { ad_spend: 100 }), day("2026-08-02")] },
      {
        period: { since: "2026-07-01", until: "2026-07-31" },
        rows: [day("2026-07-01", { ad_spend: 50 })],
      }
    );
    expect(out).toContain("ad_spend           unknown");
    expect(out).toContain("never zero");
    // The partial sum must not appear as if it were the period's spend.
    expect(out).not.toMatch(/ad_spend\s+100 vs/);
  });

  it("subtracts spend when both sides are fully covered", () => {
    const out = renderComparison(
      { period: base, rows: [day("2026-08-01", { ad_spend: 100 })] },
      {
        period: { since: "2026-07-01", until: "2026-07-31" },
        rows: [day("2026-07-01", { ad_spend: 60 })],
      }
    );
    expect(out).toContain("100 vs 60");
    expect(out).toContain("+40");
  });
});
