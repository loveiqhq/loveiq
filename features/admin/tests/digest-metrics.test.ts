import { describe, expect, it } from "vitest";
import { delta, dayString, isoWeekString } from "@features/admin/server/digest-metrics";

describe("delta", () => {
  it('says "vs none" rather than inventing a percentage, when the base is 0', () => {
    // "+∞%" is not a fact about the business. One sale after a quiet week
    // rendered as "EUR 29.00 (+∞%)", which reads like a spike and means
    // nothing — a change from zero has no percentage.
    expect(delta(5, 0)).toBe("vs none");
    expect(delta(5, 0)).not.toContain("∞");
  });

  it('returns "—" when both are 0', () => {
    expect(delta(0, 0)).toBe("—");
  });

  it("returns 0% when unchanged", () => {
    expect(delta(10, 10)).toBe("0%");
  });

  it("formats positive growth with a + sign", () => {
    expect(delta(120, 100, 0)).toBe("+20%");
  });

  it("formats negative growth without a + sign", () => {
    expect(delta(80, 100, 0)).toBe("-20%");
  });

  it("says nothing at all when the baseline is too small to compare against", () => {
    /**
     * It used to return "-100% (low base)". On the daily message that is what
     * "Paid" showed almost every day: yesterday 0 against one sale a week, which
     * the average turns into 0.14, so the arithmetic is -100% and the statement
     * is noise. A reader cannot tell that from a real collapse, and "(low base)"
     * is jargon that flags the caveat without removing it.
     */
    expect(delta(0, 0.14)).toBe("");
    expect(delta(1, 2)).toBe("");
    // The threshold is the caller's to choose.
    expect(delta(1, 2, 1)).toBe("-50%");
  });

  it("caps absurd deltas at ±999%", () => {
    expect(delta(10_000, 1, 0)).toBe("+999%");
  });
});

describe("dayString", () => {
  it("returns the UTC date in YYYY-MM-DD form", () => {
    expect(dayString(new Date(Date.UTC(2026, 4, 18, 9, 0, 0)))).toBe("2026-05-18");
  });

  it("does not get shifted by local time zone", () => {
    // 23:30 UTC on the 17th — should still be 2026-05-17 regardless of where tests run
    expect(dayString(new Date(Date.UTC(2026, 4, 17, 23, 30, 0)))).toBe("2026-05-17");
  });
});

describe("isoWeekString", () => {
  it("formats as YYYY-Www", () => {
    // 2026-05-18 is a Monday → ISO week 21
    expect(isoWeekString(new Date(Date.UTC(2026, 4, 18)))).toMatch(/^2026-W\d{2}$/);
  });

  it("handles January 1 edge case (week may belong to prior year)", () => {
    // 2026-01-01 is a Thursday → ISO week 1 of 2026
    const wk = isoWeekString(new Date(Date.UTC(2026, 0, 1)));
    expect(wk).toBe("2026-W01");
  });

  it("handles year boundary into next year", () => {
    // 2024-12-30 (Mon) is ISO week 1 of 2025 because Thursday falls in 2025
    const wk = isoWeekString(new Date(Date.UTC(2024, 11, 30)));
    expect(wk).toBe("2025-W01");
  });
});
