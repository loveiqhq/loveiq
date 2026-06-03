/**
 * Server-side content gating contract.
 *
 * [Audit M1] On locked premium sections, archetype prose ships only as a SHORT
 * TEASER (not the full paid prose) so the client can render a blurred preview
 * without the full analysis leaking to unpaid token holders. Practice names ship
 * in full; practice metric numbers (the paid value) stay server-stripped on
 * every locked row past the free-preview row 0. Unlocked sections ship in full.
 *
 * If any test here fails, either the paywall opened more than intended
 * (full prose / metrics leaked) or it closed unexpectedly (a paid section got
 * teaser'd / metrics nulled) — investigate before merging.
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

const FREE_BLOCK_IDS = reportSections
  .filter((s) => !s.isPremium && s.archetypeBlockId)
  .map((s) => s.archetypeBlockId as string);

const ANY_ARCHETYPE = "Sensual Connector";
const OTHER_ARCHETYPE = "Spark Seeker";

describe("buildArchetypeContentForUser — gates prose by plan (teaser when locked)", () => {
  it("free plan ships only a SHORT TEASER for premium sections, never the full paid prose [Audit M1]", () => {
    const result = buildArchetypeContentForUser(null, [ANY_ARCHETYPE]);

    for (const blockId of PREMIUM_BLOCK_IDS) {
      const block = archetypeContent[blockId];
      const full = block?.[ANY_ARCHETYPE];
      if (!full) continue;
      const shipped = result[blockId]?.[ANY_ARCHETYPE];
      // A teaser still ships so the client can render a blurred preview...
      expect(shipped, `premium block ${blockId} should ship a teaser`).toBeTruthy();
      // ...but it must NOT be the full paid prose, and must be much shorter.
      expect(shipped).not.toBe(full);
      expect((shipped ?? "").length).toBeLessThan(full.length);
    }
  });

  it("free plan ships free (non-premium) sections in full [Audit M1]", () => {
    const result = buildArchetypeContentForUser(null, [ANY_ARCHETYPE]);
    for (const blockId of FREE_BLOCK_IDS) {
      const block = archetypeContent[blockId];
      const full = block?.[ANY_ARCHETYPE];
      if (!full) continue;
      expect(
        result[blockId]?.[ANY_ARCHETYPE],
        `free section ${blockId} must ship in full for the free preview`
      ).toBe(full);
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
