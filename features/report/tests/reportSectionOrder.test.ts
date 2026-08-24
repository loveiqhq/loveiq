import { describe, expect, it } from "vitest";
import {
  REPORT_NAV_PARTS,
  REPORT_PART_FIRST_SECTION,
  REPORT_SECTION_ORDER,
  RETIRED_REPORT_SECTION_IDS,
} from "@features/report/ui/reportNav";

/**
 * Sections that render INLINE inside another section's branch, so they never
 * appear in `REPORT_SECTION_ORDER` on their own — they follow their host.
 */
const INLINE_SECTIONS = new Set([
  "snapshot",
  "means_for_you",
  "findings",
  "map",
  "challenges_in_partnership",
]);

describe("report body order", () => {
  it("matches the Figma part containers for Parts II, III and IV", () => {
    const at = (id: string) => REPORT_SECTION_ORDER.indexOf(id);

    // Part II (Figma 8427:1446): Beliefs → Accelerators → Attachment →
    // Insecurities → Confidence. Beliefs used to render LAST and Accelerators
    // was two parts away, in Part III.
    const partII = [
      "typical_beliefs",
      "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
      "attachment_style",
      "core_insecurities",
      "confidence_level",
    ];
    expect(partII.map(at)).toEqual([...partII.map(at)].sort((a, b) => a - b));
    expect(at("typical_beliefs")).toBeLessThan(at("attachment_style"));
    expect(at("typical_arousal_accelerators_turn_ons_of_the_core_archetype")).toBeLessThan(
      at("attachment_style")
    );

    // Part III (8427:1757 + 8427:2346) ends at Fantasy, and ALL of it comes
    // after every Part II section.
    const partIII = [
      "biochemical_reward_system_dynamics",
      "energy_level",
      "power_orientation",
      "curiosity_level",
      "love_language",
      "arousal_style",
      "initiation_style",
      "typical_sexual_fantasy_amp_practice_tendencies",
    ];
    expect(partIII.map(at)).toEqual([...partIII.map(at)].sort((a, b) => a - b));
    expect(at("confidence_level")).toBeLessThan(at("biochemical_reward_system_dynamics"));
    // Accelerators must NOT sit inside Part III any more.
    expect(at("typical_arousal_accelerators_turn_ons_of_the_core_archetype")).toBeLessThan(
      at("biochemical_reward_system_dynamics")
    );

    // Part IV (8427:2560): Libido → … → Growth → Reading.
    expect(at("typical_sexual_fantasy_amp_practice_tendencies")).toBeLessThan(
      at("libido_challenges_in_relationships")
    );
    expect(at("typical_growth_potentials_for_the_core_archetype")).toBeLessThan(
      at("recommendations")
    );
  });

  it("orders Part I hero → importance → stage → constellation", () => {
    const at = (id: string) => REPORT_SECTION_ORDER.indexOf(id);

    // Importance was moved AHEAD of Sexual Stage on 2026-08-24 (it says how much
    // weight sex carries at all, so it frames the stage rather than trailing it).
    expect(at("core_archetype")).toBeLessThan(at("the_importance_of_sexuality"));
    expect(at("the_importance_of_sexuality")).toBeLessThan(at("sexual_stage"));

    // Constellation stays the LAST free Part I block. It is mounted as the
    // sibling of whichever chapter Part I ends on, so this order and that mount
    // point in ReportPage have to agree — if this flips, the fourteen-row list
    // renders mid-part.
    expect(at("sexual_stage")).toBeLessThan(at("constellation"));
    expect(at("constellation")).toBeLessThan(at("typical_beliefs"));
  });

  it("keeps the sidebar in the same order as the body", () => {
    // The scroll-spy reads the body and highlights the nav, so a disagreement
    // shows up as a sidebar that jumps backwards while the reader scrolls on.
    for (const part of REPORT_NAV_PARTS) {
      const ordered = part.items
        .map((item) => REPORT_SECTION_ORDER.indexOf(item.id))
        .filter((i) => i >= 0);
      expect(ordered, `${part.part} nav order`).toEqual([...ordered].sort((a, b) => a - b));
    }
  });

  it("starts each part divider on the section that actually opens that part", () => {
    for (const id of Object.values(REPORT_PART_FIRST_SECTION)) {
      expect(REPORT_SECTION_ORDER).toContain(id);
    }
    const idx = Object.values(REPORT_PART_FIRST_SECTION).map((id) =>
      REPORT_SECTION_ORDER.indexOf(id)
    );
    // Dividers must appear in Part I → IV order.
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(REPORT_SECTION_ORDER[0]).toBe(REPORT_PART_FIRST_SECTION.partI);
  });

  it("renders every chapter the nav links to", () => {
    // A nav entry pointing at a section the body never renders is a dead link.
    for (const part of REPORT_NAV_PARTS) {
      for (const item of part.items) {
        const rendered = REPORT_SECTION_ORDER.includes(item.id) || INLINE_SECTIONS.has(item.id);
        expect(rendered, `nav item "${item.label}" (#${item.id}) has nothing to scroll to`).toBe(
          true
        );
      }
    }
  });

  it("never orders a section that was retired", () => {
    for (const id of REPORT_SECTION_ORDER) {
      expect(RETIRED_REPORT_SECTION_IDS.has(id)).toBe(false);
    }
  });

  it("has no duplicate ids", () => {
    expect(new Set(REPORT_SECTION_ORDER).size).toBe(REPORT_SECTION_ORDER.length);
  });
});
