import { describe, expect, it } from "vitest";
import { getPurchaseTitle } from "@features/checkout/server/reportPurchase";

/** Payments 462 and 463 (2026-10-06) both read "Only Your Highest Archetype"; 463 bought Minimalist Companion. */
describe("getPurchaseTitle", () => {
  it("names the archetype of a single report bought for another one", () => {
    expect(getPurchaseTitle("full_report", "Minimalist Companion", "Relational Nurturer")).toBe(
      "Only the Minimalist Companion Report"
    );
  });
  it("keeps the plan's own name for the reader's own archetype", () => {
    expect(getPurchaseTitle("full_report", "Relational Nurturer", "Relational Nurturer")).toBe(
      "Only Your Highest Archetype"
    );
  });
  it("keeps the plan's own name with no archetype, and for all 14", () => {
    expect(getPurchaseTitle("full_report", null, "Relational Nurturer")).toBe(
      "Only Your Highest Archetype"
    );
    expect(getPurchaseTitle("all_reports", null, null)).toBe("All 14 Archetype Reports");
  });
});
