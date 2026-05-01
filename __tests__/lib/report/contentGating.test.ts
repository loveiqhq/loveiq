/**
 * The strongest paywall guarantee on the server: even if a sophisticated
 * attacker hits /api/report and inspects the raw JSON response (or mutates
 * React state in DevTools to flip `accessPlan` client-side), they CANNOT
 * see locked archetype prose or practice scores because those bytes were
 * never sent. This suite proves the gating functions in
 * `lib/report/contentGating.ts` enforce that contract.
 *
 * If any test here fails, the paywall is potentially bypassed — investigate
 * before merging.
 */

import { describe, expect, it } from "vitest";
import {
  buildArchetypeContentForUser,
  buildPracticeTendenciesForUser,
  PRACTICE_SECTION_ID,
} from "@/lib/report/contentGating";
import { archetypeContent } from "@/data/report-archetypes";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { reportSections } from "@/data/report-general";

const PREMIUM_BLOCK_IDS = reportSections
  .filter((s) => s.isPremium && s.archetypeBlockId)
  .map((s) => s.archetypeBlockId as string);

const NON_PREMIUM_ARCHETYPE_BLOCK_IDS = reportSections
  .filter((s) => !s.isPremium && s.archetypeBlockId)
  .map((s) => s.archetypeBlockId as string);

const ANY_ARCHETYPE = "Sensual Connector";
const OTHER_ARCHETYPE = "Spark Seeker";

describe("buildArchetypeContentForUser — server gates premium HTML by plan", () => {
  it("free plan + only primary archetype → no premium block ships", () => {
    const result = buildArchetypeContentForUser(null, [ANY_ARCHETYPE]);

    for (const blockId of PREMIUM_BLOCK_IDS) {
      expect(
        result[blockId],
        `premium block ${blockId} leaked to a non-paying user`
      ).toBeUndefined();
    }
  });

  it("free plan still ships non-premium block HTML for the primary archetype", () => {
    const result = buildArchetypeContentForUser(null, [ANY_ARCHETYPE]);
    // At least one non-premium archetype-specific block exists per archetype.
    const hasAnyFreeContent = NON_PREMIUM_ARCHETYPE_BLOCK_IDS.some(
      (blockId) => result[blockId]?.[ANY_ARCHETYPE]
    );
    expect(hasAnyFreeContent).toBe(true);
  });

  it("essentials plan blocks every premium-but-not-essentials section", async () => {
    const { ESSENTIALS_SECTION_IDS } = await import("@/lib/report/access");
    const essentials = new Set<string>(ESSENTIALS_SECTION_IDS);
    const result = buildArchetypeContentForUser("essentials", [ANY_ARCHETYPE]);

    for (const section of reportSections) {
      if (!section.archetypeBlockId || !section.isPremium) continue;
      const ships = result[section.archetypeBlockId]?.[ANY_ARCHETYPE] !== undefined;
      if (essentials.has(section.id)) {
        // Essentials-tier premium content SHOULD ship for essentials users.
        if (archetypeContent[section.archetypeBlockId]?.[ANY_ARCHETYPE]) {
          expect(ships, `essentials section ${section.id} missing`).toBe(true);
        }
      } else {
        // Full-report-only premium MUST NOT ship.
        expect(
          ships,
          `non-essentials premium section ${section.id} (block ${section.archetypeBlockId}) leaked to essentials user`
        ).toBe(false);
      }
    }
  });

  it("full_report plan ships every premium block for every unlocked archetype", () => {
    const result = buildArchetypeContentForUser("full_report", [ANY_ARCHETYPE, OTHER_ARCHETYPE]);

    for (const blockId of PREMIUM_BLOCK_IDS) {
      const block = archetypeContent[blockId];
      if (!block) continue;
      if (block[ANY_ARCHETYPE]) {
        expect(result[blockId]?.[ANY_ARCHETYPE]).toBe(block[ANY_ARCHETYPE]);
      }
      if (block[OTHER_ARCHETYPE]) {
        expect(result[blockId]?.[OTHER_ARCHETYPE]).toBe(block[OTHER_ARCHETYPE]);
      }
    }
  });

  it("full_report plan does NOT ship non-unlocked archetypes", () => {
    const result = buildArchetypeContentForUser("full_report", [ANY_ARCHETYPE]);
    // Pick an archetype the user did NOT unlock
    const NEVER_UNLOCKED = "Spark Seeker";
    for (const blockId of PREMIUM_BLOCK_IDS) {
      expect(
        result[blockId]?.[NEVER_UNLOCKED],
        `archetype ${NEVER_UNLOCKED} leaked to a full_report user who hasn't unlocked it`
      ).toBeUndefined();
    }
  });

  it("all_reports plan ships every archetype available", () => {
    const allArchetypes = Object.keys(archetypeContent.core_archetype ?? {});
    const result = buildArchetypeContentForUser("all_reports", allArchetypes);
    for (const blockId of PREMIUM_BLOCK_IDS) {
      const block = archetypeContent[blockId];
      if (!block) continue;
      for (const archetype of allArchetypes) {
        if (!block[archetype]) continue;
        expect(result[blockId]?.[archetype]).toBe(block[archetype]);
      }
    }
  });

  it("never includes data for archetypes outside the unlocked set", () => {
    // If an attacker tampered with the request to claim a non-existent
    // archetype, the filter rejects silently — no row in result.
    const result = buildArchetypeContentForUser("all_reports", ["__fake_archetype__"]);
    for (const blockId of PREMIUM_BLOCK_IDS) {
      expect(result[blockId]?.["__fake_archetype__"]).toBeUndefined();
    }
  });
});

describe("buildPracticeTendenciesForUser — server gates practice scores by plan", () => {
  it("free plan ships only the FIRST row + total count per group (no premium scores)", () => {
    const result = buildPracticeTendenciesForUser(null, [ANY_ARCHETYPE]);
    const archetypeContent = result[ANY_ARCHETYPE];
    expect(archetypeContent).toBeDefined();

    if (!archetypeContent) return;

    const original = reportPracticeTendencies[ANY_ARCHETYPE];
    expect(original).toBeDefined();

    for (let i = 0; i < archetypeContent.groups.length; i++) {
      const group = archetypeContent.groups[i];
      const originalGroup = original!.groups[i];

      // CONTRACT: locked groups ship at most 1 row (the free-preview).
      expect(
        group.rows.length,
        "free plan must not include premium practice rows"
      ).toBeLessThanOrEqual(1);

      // totalRowCount preserves the original count so client can render placeholders.
      expect(group.totalRowCount).toBe(originalGroup.rows.length);

      // The shipped row must be the FIRST row of the original (free preview)
      if (group.rows.length === 1) {
        expect(group.rows[0]).toEqual(originalGroup.rows[0]);
      }
    }
  });

  it("full_report plan ships all rows", () => {
    const result = buildPracticeTendenciesForUser("full_report", [ANY_ARCHETYPE]);
    const archetypeContent = result[ANY_ARCHETYPE];
    const original = reportPracticeTendencies[ANY_ARCHETYPE];

    if (!archetypeContent || !original) return;

    for (let i = 0; i < archetypeContent.groups.length; i++) {
      expect(archetypeContent.groups[i].rows.length).toBe(original.groups[i].rows.length);
    }
  });

  it("essentials plan does NOT include practice content (practice section is non-essentials premium)", () => {
    // Practice section is full-report only; essentials should ship only the
    // free-preview row, not the full set.
    const result = buildPracticeTendenciesForUser("essentials", [ANY_ARCHETYPE]);
    const archetypeContent = result[ANY_ARCHETYPE];
    if (!archetypeContent) return;

    const original = reportPracticeTendencies[ANY_ARCHETYPE]!;
    for (let i = 0; i < archetypeContent.groups.length; i++) {
      expect(archetypeContent.groups[i].rows.length).toBeLessThanOrEqual(1);
      expect(archetypeContent.groups[i].totalRowCount).toBe(original.groups[i].rows.length);
    }
  });

  it("never ships data for an archetype the user didn't unlock", () => {
    const result = buildPracticeTendenciesForUser("full_report", [ANY_ARCHETYPE]);
    const NEVER_UNLOCKED = "Spark Seeker";
    expect(result[NEVER_UNLOCKED]).toBeUndefined();
  });
});

describe("regression — the practice section id constant matches reportSections", () => {
  it("PRACTICE_SECTION_ID corresponds to a real section", () => {
    const found = reportSections.find((s) => s.id === PRACTICE_SECTION_ID);
    expect(found).toBeDefined();
  });
});
