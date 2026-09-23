import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REPORT_V3_CHAPTERS,
  REPORT_V3_NAV_PARTS,
  REPORT_V3_SECTION_ORDER,
  REPORT_V4_CHAPTERS,
  REPORT_V4_NAV_PARTS,
  REPORT_V4_SECTION_ORDER,
} from "@features/report/ui/v3/reportV3Nav";
import { REPORT_V4_PART_DIVIDER_BY_SECTION, REPORT_V4_PARTS } from "@/data/report3-archetype-page";

/**
 * Report V4 moves Typical Beliefs to the front of "How your archetype works" —
 * the team's chapter sequence (2026-09-14) and Figma 1:849. `?v3=1` keeps V3's own
 * order untouched.
 */

const REPORT_PAGE = readFileSync(join(__dirname, "..", "ui", "ReportPage.tsx"), "utf8");

describe("the V4 chapter order", () => {
  it("has exactly V3's ids, so every order-keyed filter still holds", () => {
    expect([...REPORT_V4_SECTION_ORDER].sort()).toEqual([...REPORT_V3_SECTION_ORDER].sort());
    expect(REPORT_V4_SECTION_ORDER).toHaveLength(REPORT_V3_SECTION_ORDER.length);
  });

  it("opens the part with Typical Beliefs, then Accelerators & Brakes", () => {
    expect(REPORT_V4_SECTION_ORDER.slice(0, 3)).toEqual([
      "core_archetype",
      "typical_beliefs",
      "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    ]);
    expect(REPORT_V4_CHAPTERS.slice(0, 2).map((c) => [c.id, c.number])).toEqual([
      ["typical_beliefs", "2.1"],
      ["typical_arousal_accelerators_turn_ons_of_the_core_archetype", "2.2"],
    ]);
  });

  it("leaves V3's own order and numbering alone", () => {
    expect(REPORT_V3_CHAPTERS.slice(0, 2).map((c) => [c.id, c.number])).toEqual([
      ["typical_arousal_accelerators_turn_ons_of_the_core_archetype", "2.1"],
      ["typical_beliefs", "2.2"],
    ]);
  });

  it("lists the nav in the same order as the body", () => {
    const v4Part = REPORT_V4_NAV_PARTS[1]!.items.map((i) => i.id);
    expect(v4Part.slice(0, 2)).toEqual([
      "typical_beliefs",
      "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
    ]);
    expect(REPORT_V3_NAV_PARTS[1]!.items[0]!.id).toBe(
      "typical_arousal_accelerators_turn_ons_of_the_core_archetype"
    );
  });

  it("keys Part III's heading on its new first chapter", () => {
    expect(REPORT_V4_PART_DIVIDER_BY_SECTION.typical_beliefs).toBe(REPORT_V4_PARTS[2]);
    expect(
      REPORT_V4_PART_DIVIDER_BY_SECTION.typical_arousal_accelerators_turn_ons_of_the_core_archetype
    ).toBeUndefined();
    // Every V4 heading key comes in body order, one per part.
    const keys = Object.keys(REPORT_V4_PART_DIVIDER_BY_SECTION);
    const positions = keys.map((k) => REPORT_V4_SECTION_ORDER.indexOf(k));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("never falls back to a V3 part heading under V4", () => {
    // Accelerators & Brakes still has a V3 key; without this guard a V3 "Part II"
    // heading would render between Typical Beliefs and it.
    expect(REPORT_PAGE).toContain(") : partDivider && !isV4 ? (");
    expect(REPORT_PAGE).toMatch(/const sectionOrder = isV4\s*\?\s*REPORT_V4_SECTION_ORDER/);
  });
});
