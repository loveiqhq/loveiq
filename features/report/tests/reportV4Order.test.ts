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
import {
  REPORT_V4_PART5_CHAPTERS,
  REPORT_V4_PART_DIVIDER_BY_SECTION,
  REPORT_V4_PARTS,
} from "@/data/report3-archetype-page";

/**
 * Report V4 regroups two chapters against V3, both as Figma draws them:
 * - Typical Beliefs opens "How your archetype works" (the team's chapter sequence,
 *   2026-09-14, and Figma 1:849).
 * - Accelerators & Brakes opens "Your erotic engine" (Figma 334:521 / 1:982, and the
 *   Notion content roadmap's "Part IV - Your Erotic Engine, Order 1"). Fatih's call,
 *   2026-09-23.
 * `?v3=1` keeps V3's own order untouched.
 */

const REPORT_PAGE = readFileSync(join(__dirname, "..", "ui", "ReportPage.tsx"), "utf8");
const AB = "typical_arousal_accelerators_turn_ons_of_the_core_archetype";

// Review 24.09: "Please take out the Arousal, Desire & Sexual Stage Chapter" and "Take out
// the Summary, Sexual Stage, Importance of Sexuality chapters please".
const REMOVED_IN_V4 = [
  "background_know_how_arousal_desire_and_pleasure",
  "sexual_stage",
  "the_importance_of_sexuality",
];

describe("the V4 chapter order", () => {
  it("has V3's ids minus the three the 24.09 review took out", () => {
    expect([...REPORT_V4_SECTION_ORDER].sort()).toEqual(
      REPORT_V3_SECTION_ORDER.filter((id) => !REMOVED_IN_V4.includes(id)).sort()
    );
    for (const id of REMOVED_IN_V4) {
      expect(REPORT_V4_SECTION_ORDER).not.toContain(id);
      expect(REPORT_V4_NAV_PARTS.flatMap((p) => p.items.map((i) => i.id))).not.toContain(id);
      // V3 keeps all three.
      expect(REPORT_V3_SECTION_ORDER).toContain(id);
    }
  });

  it("opens 'How You connect' with Challenges in Partnership (review 24.09)", () => {
    // "Double Check the Chapter order. Challenges in Partnership is the first chapter
    // in Part V." V3 calls that part 4, and keeps the chapter last in it.
    expect(
      REPORT_V4_CHAPTERS.filter((c) => c.number.startsWith("4.")).map((c) => [c.id, c.number])
    ).toEqual([
      ["challenges_in_partnership", "4.1"],
      ["attachment_style", "4.2"],
      ["love_language", "4.3"],
      ["curiosity_level", "4.4"],
    ]);
    const connect = REPORT_V4_NAV_PARTS.find((p) =>
      p.items.some((i) => i.id === "attachment_style")
    )!;
    expect(connect.items[0]!.id).toBe("challenges_in_partnership");
    expect(REPORT_V3_CHAPTERS.find((c) => c.id === "challenges_in_partnership")!.number).toBe(
      "4.4"
    );
  });

  it("closes the report on Other Archetypes, after Reading Recommendations", () => {
    expect(REPORT_V4_SECTION_ORDER.slice(-2)).toEqual(["recommendations", "constellation"]);
  });

  it("opens 'How your archetype works' with Typical Beliefs, and closes it before A&B", () => {
    expect(REPORT_V4_SECTION_ORDER.slice(0, 7)).toEqual([
      "core_archetype",
      "typical_beliefs",
      "core_insecurities",
      "confidence_level",
      "power_orientation",
      AB,
      "libido_challenges_in_relationships",
    ]);
  });

  it("numbers each part from 1 in body order, with A&B as 3.1", () => {
    expect(REPORT_V4_CHAPTERS.slice(0, 7).map((c) => [c.id, c.number])).toEqual([
      ["typical_beliefs", "2.1"],
      ["core_insecurities", "2.2"],
      ["confidence_level", "2.3"],
      ["power_orientation", "2.4"],
      [AB, "3.1"],
      ["libido_challenges_in_relationships", "3.2"],
      ["biochemical_reward_system_dynamics", "3.3"],
    ]);
    // Every part counts 1, 2, 3 … with no gaps or repeats, so the V3 eyebrows the
    // other chapters still carry keep counting up.
    const byPart = new Map<string, number[]>();
    for (const c of REPORT_V4_CHAPTERS) {
      const [part, n] = c.number.split(".");
      byPart.set(part!, [...(byPart.get(part!) ?? []), Number(n)]);
    }
    for (const numbers of byPart.values()) {
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    }
  });

  it('titles A&B in the plural, as V3 does (review 24.09: add the "s" everywhere)', () => {
    expect(REPORT_V4_CHAPTERS.find((c) => c.id === AB)!.title).toBe("Accelerators & Brakes");
    expect(REPORT_V3_CHAPTERS.find((c) => c.id === AB)!.title).toBe("Accelerators & Brakes");
  });

  it("titles Challenges in Partnerships in the plural, in V4 only (Fatih, 24.09: as 38:1675)", () => {
    const CIP = "challenges_in_partnership";
    const label = (parts: typeof REPORT_V4_NAV_PARTS) =>
      parts.flatMap((p) => p.items).find((i) => i.id === CIP)!.label;
    expect(REPORT_V4_CHAPTERS.find((c) => c.id === CIP)!.title).toBe("Challenges in Partnerships");
    expect(label(REPORT_V4_NAV_PARTS)).toBe("Challenges in Partnerships");
    expect(REPORT_V4_PART5_CHAPTERS[0]!.title).toBe("Challenges in Partnerships");
    // ?v3=1 keeps its singular.
    expect(REPORT_V3_CHAPTERS.find((c) => c.id === CIP)!.title).toBe("Challenges in Partnership");
    expect(label(REPORT_V3_NAV_PARTS)).toBe("Challenges in Partnership");
  });

  it("leaves V3's own order and numbering alone", () => {
    expect(REPORT_V3_CHAPTERS.slice(0, 2).map((c) => [c.id, c.number])).toEqual([
      [AB, "2.1"],
      ["typical_beliefs", "2.2"],
    ]);
    expect(
      REPORT_V3_CHAPTERS.find((c) => c.id === "libido_challenges_in_relationships")!.number
    ).toBe("3.1");
  });

  it("lists the nav in the same order as the body", () => {
    expect(REPORT_V4_NAV_PARTS[1]!.items.map((i) => i.id)).toEqual([
      "typical_beliefs",
      "core_insecurities",
      "confidence_level",
      "power_orientation",
    ]);
    expect(REPORT_V4_NAV_PARTS[2]!.items.slice(0, 2).map((i) => [i.id, i.label])).toEqual([
      [AB, "Accelerators & Brakes"],
      ["libido_challenges_in_relationships", "Libido Challenges"],
    ]);
    expect(REPORT_V3_NAV_PARTS[1]!.items[0]!.id).toBe(AB);
  });

  it("keys each V4 part heading on the part's new first chapter", () => {
    expect(REPORT_V4_PART_DIVIDER_BY_SECTION.typical_beliefs).toBe(REPORT_V4_PARTS[2]);
    expect(REPORT_V4_PART_DIVIDER_BY_SECTION[AB]).toBe(REPORT_V4_PARTS[3]);
    expect(REPORT_V4_PART_DIVIDER_BY_SECTION.libido_challenges_in_relationships).toBeUndefined();
    // Every V4 heading key comes in body order, one per part.
    const keys = Object.keys(REPORT_V4_PART_DIVIDER_BY_SECTION);
    const positions = keys.map((k) => REPORT_V4_SECTION_ORDER.indexOf(k));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("sets Part IV's heading as 1:990 does: 'Your' upright, 'erotic engine' in the accent", () => {
    expect(REPORT_V4_PARTS[3]).toMatchObject({
      eyebrow: "Part IV",
      lead: "Your ",
      accent: "erotic engine",
    });
  });

  it("swaps Accelerators & Brakes' V4 chapter in, behind the 44px separator 1:991", () => {
    // The branch mirrors Typical Beliefs': V4 only, and only where the chapter is
    // written for the archetype on screen — every other reader keeps V2's section.
    expect(REPORT_PAGE).toMatch(/if \(isV4 && accelerators && hasAccelCopy\)/);
    expect(REPORT_PAGE).toContain('data-node-id="1:991"');
    expect(REPORT_PAGE).toMatch(/<V4Accelerators\s+view=\{accelerators\}/);
    expect(REPORT_PAGE).toMatch(/title="Accelerators & Brakes"/);
    expect(REPORT_PAGE).not.toMatch(/"Accelerator & Brakes"/);
  });

  it("never falls back to a V3 part heading under V4", () => {
    // V3 keys its own dividers on other chapters; without this guard a V3 heading
    // would render inside V4's parts.
    expect(REPORT_PAGE).toContain(") : partDivider && !isV4 ? (");
    expect(REPORT_PAGE).toMatch(/const sectionOrder = isV4\s*\?\s*REPORT_V4_SECTION_ORDER/);
  });
});
