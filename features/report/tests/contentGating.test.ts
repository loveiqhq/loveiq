/**
 * Server-side content gating contract.
 *
 * Product decision (see plan "whimsical-greeting-popcorn"): on locked
 * premium sections, archetype prose AND practice names ship to the client
 * so the UI can render a blurred tease behind a `PremiumOverlay`. The
 * **paid value** — practice metric numbers — stays server-stripped on
 * every locked row past the free-preview row 0.
 *
 * If any test here fails, either the paywall opened more than intended
 * (metrics leaked) or it closed unexpectedly (the tease regressed) —
 * investigate before merging.
 */

import { describe, expect, it } from "vitest";
import {
  buildArchetypeContentForUser,
  buildPracticeTendenciesForUser,
  PRACTICE_SECTION_ID,
} from "@features/report/server/contentGating";
import { archetypeContent } from "@/data/report-archetypes";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { reportSections } from "@/data/report-general";

const PREMIUM_BLOCK_IDS = reportSections
  .filter((s) => s.isPremium && s.archetypeBlockId)
  .map((s) => s.archetypeBlockId as string);

const ANY_ARCHETYPE = "Sensual Connector";
const OTHER_ARCHETYPE = "Spark Seeker";

describe("buildArchetypeContentForUser — ships archetype HTML for client-side blur", () => {
  it("free plan still ships premium HTML for the primary archetype (client renders blurred + overlay)", () => {
    const result = buildArchetypeContentForUser(null, [ANY_ARCHETYPE]);

    for (const blockId of PREMIUM_BLOCK_IDS) {
      const block = archetypeContent[blockId];
      if (!block?.[ANY_ARCHETYPE]) continue;
      expect(
        result[blockId]?.[ANY_ARCHETYPE],
        `premium block ${blockId} should ship for the primary archetype so it can be blurred`
      ).toBe(block[ANY_ARCHETYPE]);
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

  it("does NOT ship archetypes outside the unlocked set (per-archetype gate still enforced)", () => {
    const result = buildArchetypeContentForUser("full_report", [ANY_ARCHETYPE]);
    const NEVER_UNLOCKED = "Spark Seeker";
    for (const blockId of PREMIUM_BLOCK_IDS) {
      expect(
        result[blockId]?.[NEVER_UNLOCKED],
        `archetype ${NEVER_UNLOCKED} leaked to a user who hasn't unlocked it`
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

  it("ignores fake archetype names (no row leaks for an unknown key)", () => {
    const result = buildArchetypeContentForUser("all_reports", ["__fake_archetype__"]);
    for (const blockId of PREMIUM_BLOCK_IDS) {
      expect(result[blockId]?.["__fake_archetype__"]).toBeUndefined();
    }
  });
});

describe("buildPracticeTendenciesForUser — ships names, hides numbers when locked", () => {
  it("free plan ships every row with practice names; metrics nulled past row 0", () => {
    const result = buildPracticeTendenciesForUser(null, [ANY_ARCHETYPE]);
    const userContent = result[ANY_ARCHETYPE];
    expect(userContent).toBeDefined();
    if (!userContent) return;

    const original = reportPracticeTendencies[ANY_ARCHETYPE];
    expect(original).toBeDefined();
    if (!original) return;

    for (let i = 0; i < userContent.groups.length; i++) {
      const group = userContent.groups[i];
      const originalGroup = original.groups[i];

      // All rows ship — names tease what's there.
      expect(group.rows.length).toBe(originalGroup.rows.length);
      expect(group.totalRowCount).toBe(originalGroup.rows.length);

      group.rows.forEach((row, rowIndex) => {
        // Practice name always ships
        expect(row.practice).toBe(originalGroup.rows[rowIndex].practice);

        if (rowIndex === 0) {
          // Free-preview row keeps real metric numbers
          expect(row.fantasyPull).toBe(originalGroup.rows[rowIndex].fantasyPull);
          expect(row.actualPleasure).toBe(originalGroup.rows[rowIndex].actualPleasure);
        } else {
          // Locked rows: metric numbers MUST NOT reach the wire (paid value)
          expect(
            row.fantasyPull,
            `fantasyPull leaked on locked row ${rowIndex} of group ${group.title}`
          ).toBeNull();
          expect(
            row.actualPleasure,
            `actualPleasure leaked on locked row ${rowIndex} of group ${group.title}`
          ).toBeNull();
        }
      });
    }
  });

  it("essentials plan also locks practice metrics (practice section is full-report tier)", () => {
    const result = buildPracticeTendenciesForUser("essentials", [ANY_ARCHETYPE]);
    const userContent = result[ANY_ARCHETYPE];
    if (!userContent) return;

    const original = reportPracticeTendencies[ANY_ARCHETYPE]!;
    for (let i = 0; i < userContent.groups.length; i++) {
      const group = userContent.groups[i];
      expect(group.totalRowCount).toBe(original.groups[i].rows.length);
      group.rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) return;
        expect(row.fantasyPull).toBeNull();
        expect(row.actualPleasure).toBeNull();
      });
    }
  });

  it("full_report plan ships full metric numbers on every row", () => {
    const result = buildPracticeTendenciesForUser("full_report", [ANY_ARCHETYPE]);
    const userContent = result[ANY_ARCHETYPE];
    const original = reportPracticeTendencies[ANY_ARCHETYPE];
    if (!userContent || !original) return;

    for (let i = 0; i < userContent.groups.length; i++) {
      const group = userContent.groups[i];
      const originalGroup = original.groups[i];
      expect(group.rows.length).toBe(originalGroup.rows.length);
      group.rows.forEach((row, rowIndex) => {
        expect(row.fantasyPull).toBe(originalGroup.rows[rowIndex].fantasyPull);
        expect(row.actualPleasure).toBe(originalGroup.rows[rowIndex].actualPleasure);
      });
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
