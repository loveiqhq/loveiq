import { describe, expect, it } from "vitest";
import {
  ESSENTIALS_SECTION_IDS,
  getStrongestReportAccessPlan,
  getUnlockedPremiumSectionIdsForPlan,
  isSectionUnlockedForPlan,
} from "@/lib/report/access";

describe("report access helpers", () => {
  it("chooses the strongest purchased plan", () => {
    expect(getStrongestReportAccessPlan(["essentials", "full_report"])).toBe("full_report");
    expect(getStrongestReportAccessPlan(["essentials", "all_reports"])).toBe("all_reports");
    expect(getStrongestReportAccessPlan([null, undefined])).toBeNull();
  });

  it("unlocks only essentials sections for the essentials plan", () => {
    expect(
      isSectionUnlockedForPlan({
        accessPlan: "essentials",
        isPremium: true,
        sectionId: ESSENTIALS_SECTION_IDS[0],
      })
    ).toBe(true);

    expect(
      isSectionUnlockedForPlan({
        accessPlan: "essentials",
        isPremium: true,
        sectionId: "typical_growth_potentials_for_the_core_archetype",
      })
    ).toBe(false);
  });

  it("unlocks every premium section for full and all reports", () => {
    expect(getUnlockedPremiumSectionIdsForPlan("full_report").length).toBeGreaterThan(
      ESSENTIALS_SECTION_IDS.length
    );
    expect(getUnlockedPremiumSectionIdsForPlan("all_reports")).toEqual(
      getUnlockedPremiumSectionIdsForPlan("full_report")
    );
  });
});
