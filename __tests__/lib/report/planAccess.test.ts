import { describe, expect, it } from "vitest";
import { canSharePlan, getShareSeatLimit } from "@/lib/report/planAccess";

describe("getShareSeatLimit", () => {
  it("free (null) plan has zero seats", () => {
    expect(getShareSeatLimit(null)).toBe(0);
  });

  it("essentials grants 1 seat", () => {
    expect(getShareSeatLimit("essentials")).toBe(1);
  });

  it("full_report grants 2 seats", () => {
    expect(getShareSeatLimit("full_report")).toBe(2);
  });

  it("all_reports grants 2 seats", () => {
    expect(getShareSeatLimit("all_reports")).toBe(2);
  });
});

describe("canSharePlan", () => {
  it("returns false only for the free (null) plan", () => {
    expect(canSharePlan(null)).toBe(false);
  });

  it("returns true for essentials, full_report, and all_reports", () => {
    expect(canSharePlan("essentials")).toBe(true);
    expect(canSharePlan("full_report")).toBe(true);
    expect(canSharePlan("all_reports")).toBe(true);
  });
});
