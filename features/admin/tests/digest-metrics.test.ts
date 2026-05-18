import { describe, expect, it } from "vitest";
import { delta, dayString, isoWeekString } from "@features/admin/server/digest-metrics";

describe("delta", () => {
  it("returns +∞% when prev is 0 and curr is positive", () => {
    expect(delta(5, 0)).toBe("+∞%");
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

  it("appends (low base) when prev is below threshold", () => {
    // Default threshold is 5
    expect(delta(10, 2)).toBe("+400% (low base)");
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
