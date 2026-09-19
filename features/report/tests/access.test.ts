import { describe, expect, it } from "vitest";
import { reportSections } from "@/data/report-general";
import {
  getStrongestReportAccessPlan,
  getUnlockedPremiumSectionIdsForPlan,
  isReportPurchasePlan,
  isSectionIncludedInEssentials,
  isSectionUnlockedForPlan,
  doesAccessPlanCover,
} from "@features/report/server/access";

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

  it("unlocks for core plan", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: "core" })).toBe(true);
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

  it("unlocks for core plan", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: "core" })).toBe(true);
  });
});

/**
 * `core` buys the reader's top-3 archetypes at full_report tier. It was the one
 * plan missing from this function's tier ladder, and because every server call
 * site passes `accessPlan` alone, that left `effectiveTier` null and locked
 * EVERY premium section for core buyers — a paid report that rendered as if
 * nothing had been bought. Two live purchases hit it before it was found
 * (2026-09-05). The whole plan set is swept here so the next plan added cannot
 * repeat it.
 */
describe("isSectionUnlockedForPlan — every plan, on a full_report-tier section", () => {
  const baseArgs = { sectionId: GROWTH_ID, isPremium: true };

  it.each([
    [null, false],
    ["essentials" as const, false],
    ["full_report" as const, true],
    ["core" as const, true],
    ["all_reports" as const, true],
  ])("accessPlan %s alone -> unlocked: %s", (accessPlan, expected) => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan })).toBe(expected);
  });

  it("a per-archetype full_report tier unlocks regardless of plan", () => {
    expect(
      isSectionUnlockedForPlan({ ...baseArgs, accessPlan: null, archetypeTier: "full_report" })
    ).toBe(true);
  });

  it("a per-archetype essentials tier still locks a full_report-tier section", () => {
    expect(
      isSectionUnlockedForPlan({ ...baseArgs, accessPlan: "core", archetypeTier: "essentials" })
    ).toBe(false);
  });

  it("never unlocks a non-premium section check by accident", () => {
    expect(isSectionUnlockedForPlan({ ...baseArgs, accessPlan: null, isPremium: false })).toBe(
      true
    );
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
  it("isReportPurchasePlan identifies all four known plan ids", () => {
    expect(isReportPurchasePlan("essentials")).toBe(true);
    expect(isReportPurchasePlan("full_report")).toBe(true);
    expect(isReportPurchasePlan("core")).toBe(true);
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

/**
 * `doesAccessPlanCover` is what decides whether an upsell surface still has
 * anything to sell. Getting `core` wrong here is not cosmetic: the report's
 * sticky bar sells `full_report`, so a core buyer — who owns their top-3 AT
 * full_report tier — was shown a permanent "Unlock full report" bar whose CTA
 * opened a Stripe checkout for something they had already paid for.
 */
describe("doesAccessPlanCover", () => {
  it.each([
    [null, "essentials", false],
    [null, "full_report", false],
    ["essentials" as const, "essentials", true],
    ["essentials" as const, "full_report", false],
    ["full_report" as const, "full_report", true],
    ["full_report" as const, "all_reports", false],
    ["core" as const, "essentials", true],
    ["core" as const, "full_report", true],
    ["core" as const, "core", true],
    ["core" as const, "all_reports", false],
    ["all_reports" as const, "all_reports", true],
    ["all_reports" as const, "full_report", true],
  ] as const)("plan %s covers %s -> %s", (accessPlan, targetPlan, expected) => {
    expect(doesAccessPlanCover(accessPlan, targetPlan)).toBe(expected);
  });

  it("core still has all_reports left to sell", () => {
    // The one upsell a core buyer SHOULD still see.
    expect(doesAccessPlanCover("core", "all_reports")).toBe(false);
  });
});

/**
 * The upsell surfaces must ask the coverage question, not list plan ids by hand
 * — that hand-written list is what skipped `core`.
 */
describe("report upsell surfaces ask about plan coverage", () => {
  it("the sticky unlock bar and its spacer both go through doesAccessPlanCover", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "features/report/ui/ReportPage.tsx"), "utf8");

    expect(src).toContain('!doesAccessPlanCover(data.accessPlan, "full_report")');
    expect(src).toContain('doesAccessPlanCover(accessPlan, "full_report") ? ""');
    expect(src, "enumerating plan ids by hand is what hid core from this check").not.toMatch(
      /accessPlan !== "full_report" && [\w.]*accessPlan !== "all_reports"/
    );
  });
});
