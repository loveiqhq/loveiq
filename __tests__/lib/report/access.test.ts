import { describe, expect, it } from "vitest";
import { reportSections } from "@/data/report-general";
import {
  getStrongestReportAccessPlan,
  getUnlockedPremiumSectionIdsForPlan,
  isReportPurchasePlan,
  isSectionIncludedInEssentials,
  isSectionUnlockedForPlan,
} from "@/lib/report/access";

const GROWTH_ID = "typical_growth_potentials_for_the_core_archetype";
const RECOMMENDATIONS_ID = "recommendations";

function getSection(id: string) {
  const section = reportSections.find((s) => s.id === id);
  if (!section) throw new Error(`section ${id} missing from reportSections`);
  return section;
}

describe("Growth Potentials and Recommendations are full_report-tier", () => {
  it("Growth Potentials is flagged premium in the section catalog", () => {
    expect(getSection(GROWTH_ID).isPremium).toBe(true);
  });

  it("Recommendations is flagged premium in the section catalog", () => {
    expect(getSection(RECOMMENDATIONS_ID).isPremium).toBe(true);
  });

  it("neither section is in the Essentials allowlist", () => {
    expect(isSectionIncludedInEssentials(GROWTH_ID)).toBe(false);
    expect(isSectionIncludedInEssentials(RECOMMENDATIONS_ID)).toBe(false);
  });
});

describe("isSectionUnlockedForPlan — Growth Potentials", () => {
  const baseArgs = { sectionId: GROWTH_ID, isPremium: true };

  it("locks for free (null) plan", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: null })).toBe(false);
  });

  it("locks for essentials plan", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: "essentials" })).toBe(false);
  });

  it("unlocks for full_report plan", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: "full_report" })).toBe(true);
  });

  it("unlocks for all_reports plan", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: "all_reports" })).toBe(true);
  });
});

describe("isSectionUnlockedForPlan — Recommendations", () => {
  const baseArgs = { sectionId: RECOMMENDATIONS_ID, isPremium: true };

  it("locks for free (null) plan", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: null })).toBe(false);
  });

  it("locks for essentials plan", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: "essentials" })).toBe(false);
  });

  it("unlocks for full_report plan", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: "full_report" })).toBe(true);
  });

  it("unlocks for all_reports plan", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: "all_reports" })).toBe(true);
  });
});

describe("getUnlockedPremiumSectionIdsForPlan", () => {
  it("free plan unlocks no premium sections", () => {
    expect(getUnlockedPremiumSectionIdsForPlan(null)).toEqual([]);
  });

  it("essentials plan returns only the essentials section ids", () => {
    const ids = getUnlockedPremiumSectionIdsForPlan("essentials");
    expect(ids).not.toContain(GROWTH_ID);
    expect(ids).not.toContain(RECOMMENDATIONS_ID);
  });

  it("full_report plan unlocks Growth Potentials and Recommendations", () => {
    const ids = getUnlockedPremiumSectionIdsForPlan("full_report");
    expect(ids).toContain(GROWTH_ID);
    expect(ids).toContain(RECOMMENDATIONS_ID);
  });

  it("all_reports plan unlocks Growth Potentials and Recommendations", () => {
    const ids = getUnlockedPremiumSectionIdsForPlan("all_reports");
    expect(ids).toContain(GROWTH_ID);
    expect(ids).toContain(RECOMMENDATIONS_ID);
  });
});

describe("plan helpers", () => {
  it("isReportPurchasePlan identifies all three known plan ids", () => {
    expect(isReportPurchasePlan("essentials")).toBe(true);
    expect(isReportPurchasePlan("full_report")).toBe(true);
    expect(isReportPurchasePlan("all_reports")).toBe(true);
    expect(isReportPurchasePlan(null)).toBe(false);
    expect(isReportPurchasePlan("free")).toBe(false);
  });

  it("getStrongestReportAccessPlan returns the highest-priority plan", () => {
    expect(getStrongestReportAccessPlan([null, "essentials"])).toBe("essentials");
    expect(getStrongestReportAccessPlan(["essentials", "full_report"])).toBe("full_report");
    expect(getStrongestReportAccessPlan(["full_report", "all_reports"])).toBe("all_reports");
    expect(getStrongestReportAccessPlan([null, undefined])).toBe(null);
  });
});
