import { describe, expect, it } from "vitest";
import { canSharePlan, getShareSeatLimit } from "@/lib/report/planAccess";

describe("getShareSeatLimit", () => {
  it("free (null) plan has zero seats", () => {
    expect(getShareSeatLimit(null)).toBe(0);
  });

  it("essentials has zero seats (spec)", () => {
    expect(getShareSeatLimit("essentials")).toBe(0);
  });

  it("full_report grants 2 seats", () => {
    expect(getShareSeatLimit("full_report")).toBe(2);
  });

  it("all_reports grants 2 seats", () => {
    expect(getShareSeatLimit("all_reports")).toBe(2);
  });
});

describe("canSharePlan", () => {
  it("returns false for free and essentials", () => {
    expect(canSharePlan(null)).toBe(false);
    expect(canSharePlan("essentials")).toBe(false);
  });

  it("returns true for full_report and all_reports", () => {
    expect(canSharePlan("full_report")).toBe(true);
    expect(canSharePlan("all_reports")).toBe(true);
  });
});
