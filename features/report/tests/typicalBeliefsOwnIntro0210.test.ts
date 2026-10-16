import { describe, expect, it } from "vitest";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import {
  TYPICAL_BELIEFS_INTRO,
  TYPICAL_BELIEFS_SUN_SHADOW,
  buildTypicalBeliefs,
} from "@/data/report3-typical-beliefs";

/**
 * Sanjin's Curious Apprentice doc (01.10) opened Typical Beliefs on three paragraphs of its
 * own, where every other doc kept the four universal ones. His slimmed doc (16.10) gives
 * the chapter one short universal opening for all fourteen and moves the example and the
 * framework under "Sun and Shadow Beliefs", so no record carries an opening of its own any
 * more: an archetype's own copy starts at its lede, under "The <Archetype>".
 */
describe("buildTypicalBeliefs — one opening for every archetype (16.10)", () => {
  it("is one paragraph", () => {
    expect(TYPICAL_BELIEFS_INTRO).toHaveLength(1);
  });

  it.each(KNOWN_ARCHETYPES)(
    "%s opens on it, then Sun and Shadow Beliefs, open or locked",
    (name) => {
      for (const locked of [false, true]) {
        const view = buildTypicalBeliefs(name, { locked })!;
        expect(view.intro).toEqual(TYPICAL_BELIEFS_INTRO);
        expect(view.sunShadow).toEqual(TYPICAL_BELIEFS_SUN_SHADOW);
      }
    }
  );

  it.each(KNOWN_ARCHETYPES)("%s's lede is prose, with no heading of its own", (name) => {
    const { lede } = buildTypicalBeliefs(name)!;
    expect(lede.length).toBeGreaterThan(0);
    expect(lede.some((block) => block.kind === "heading")).toBe(false);
  });
});
