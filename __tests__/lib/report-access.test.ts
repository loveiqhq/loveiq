import { describe, expect, it } from "vitest";
import {
  ESSENTIALS_SECTION_IDS,
  getStrongestReportAccessPlan,
  getUnlockedPremiumSectionIdsForPlan,
  isPlanOwnedForArchetype,
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

  it("full_report unlocks both essentials and non-essentials sections", () => {
    for (const sectionId of ESSENTIALS_SECTION_IDS) {
      expect(
        isSectionUnlockedForPlan({ accessPlan: "full_report", isPremium: true, sectionId })
      ).toBe(true);
    }
    expect(
      isSectionUnlockedForPlan({
        accessPlan: "full_report",
        isPremium: true,
        sectionId: "typical_growth_potentials_for_the_core_archetype",
      })
    ).toBe(true);
  });

  describe("per-archetype tier gating", () => {
    const FULL_ONLY_SECTION = "typical_growth_potentials_for_the_core_archetype";
    const ESSENTIALS_SECTION = ESSENTIALS_SECTION_IDS[0];

    it("archetypeTier=essentials unlocks essentials sections only", () => {
      expect(
        isSectionUnlockedForPlan({
          accessPlan: null,
          archetypeTier: "essentials",
          isPremium: true,
          sectionId: ESSENTIALS_SECTION,
        })
      ).toBe(true);
      expect(
        isSectionUnlockedForPlan({
          accessPlan: null,
          archetypeTier: "essentials",
          isPremium: true,
          sectionId: FULL_ONLY_SECTION,
        })
      ).toBe(false);
    });

    it("archetypeTier=full_report unlocks every premium section", () => {
      expect(
        isSectionUnlockedForPlan({
          accessPlan: null,
          archetypeTier: "full_report",
          isPremium: true,
          sectionId: FULL_ONLY_SECTION,
        })
      ).toBe(true);
    });

    it("archetypeTier overrides falsy accessPlan", () => {
      expect(
        isSectionUnlockedForPlan({
          accessPlan: null,
          archetypeTier: "full_report",
          isPremium: true,
          sectionId: FULL_ONLY_SECTION,
        })
      ).toBe(true);
    });

    it("all_reports plan beats archetypeTier (global covers everything)", () => {
      expect(
        isSectionUnlockedForPlan({
          accessPlan: "all_reports",
          archetypeTier: null,
          isPremium: true,
          sectionId: FULL_ONLY_SECTION,
        })
      ).toBe(true);
    });
  });

  describe("isPlanOwnedForArchetype", () => {
    it("all_reports owns every plan", () => {
      for (const target of ["essentials", "full_report", "all_reports"] as const) {
        expect(
          isPlanOwnedForArchetype({
            accessPlan: "all_reports",
            targetPlan: target,
            unlockedTier: null,
          })
        ).toBe(true);
      }
    });

    it("essentials tier owns Essentials card but not Full Report card", () => {
      expect(
        isPlanOwnedForArchetype({
          accessPlan: null,
          targetPlan: "essentials",
          unlockedTier: "essentials",
        })
      ).toBe(true);
      expect(
        isPlanOwnedForArchetype({
          accessPlan: null,
          targetPlan: "full_report",
          unlockedTier: "essentials",
        })
      ).toBe(false);
    });

    it("full_report tier owns both Essentials and Full Report cards", () => {
      expect(
        isPlanOwnedForArchetype({
          accessPlan: null,
          targetPlan: "essentials",
          unlockedTier: "full_report",
        })
      ).toBe(true);
      expect(
        isPlanOwnedForArchetype({
          accessPlan: null,
          targetPlan: "full_report",
          unlockedTier: "full_report",
        })
      ).toBe(true);
    });

    it("nothing unlocked → no plans owned", () => {
      for (const target of ["essentials", "full_report", "all_reports"] as const) {
        expect(
          isPlanOwnedForArchetype({
            accessPlan: null,
            targetPlan: target,
            unlockedTier: null,
          })
        ).toBe(false);
      }
    });

    it("All Reports card owned only by all_reports plan", () => {
      expect(
        isPlanOwnedForArchetype({
          accessPlan: "full_report",
          targetPlan: "all_reports",
          unlockedTier: "full_report",
        })
      ).toBe(false);
    });

    it("global accessPlan does NOT mark a non-primary archetype as owned", () => {
      // User owns Essentials for X (primary). Modal scoped to Y, no Y entry
      // in the per-archetype tier map → unlockedTier === null. Neither card
      // should be owned for Y just because a global accessPlan is set.
      expect(
        isPlanOwnedForArchetype({
          accessPlan: "essentials",
          targetPlan: "essentials",
          unlockedTier: null,
        })
      ).toBe(false);
      expect(
        isPlanOwnedForArchetype({
          accessPlan: "essentials",
          targetPlan: "full_report",
          unlockedTier: null,
        })
      ).toBe(false);
      expect(
        isPlanOwnedForArchetype({
          accessPlan: "full_report",
          targetPlan: "essentials",
          unlockedTier: null,
        })
      ).toBe(false);
      expect(
        isPlanOwnedForArchetype({
          accessPlan: "full_report",
          targetPlan: "full_report",
          unlockedTier: null,
        })
      ).toBe(false);
    });
  });
});
