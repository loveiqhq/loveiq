import { describe, expect, it, vi } from "vitest";

/**
 * Sanjin's Curious Apprentice doc (01.10) opens Typical Beliefs on three paragraphs of its
 * own, written around that archetype, where every other doc keeps the four universal ones
 * (TYPICAL_BELIEFS_INTRO). A record may carry its own intro; without one the shared four
 * stay. Stand-in archetypes, so no copy sits in this test.
 */
const { OWN_INTRO, LEDE, record } = vi.hoisted(() => {
  const para = (text: string) => ({ kind: "para" as const, runs: [{ text }] });
  const OWN_INTRO = [para("Own intro, first."), para("Own intro, second.")];
  const LEDE = [
    { kind: "heading" as const, text: "The Stand-in belief map", level: 2 as const },
    para("For the Stand-in, a lede."),
  ];
  const record = (withIntro: boolean) => ({
    ...(withIntro ? { intro: OWN_INTRO } : {}),
    lede: LEDE,
    turns: Array.from({ length: 10 }, (_, i) => ({
      shadow: `“Shadow ${i}.”`,
      shift: `“Shift ${i}.”`,
    })),
    sun: Array.from({ length: 10 }, (_, i) => `“Sun ${i}.”`),
    challenges: [para("Challenge, first."), para("Challenge, second."), para("Challenge, third.")],
    practice: [para("Practice, first."), para("Practice, second."), para("Practice, third.")],
    cuts: { challengesFree: 1, practiceFree: 1 },
  });
  return { OWN_INTRO, LEDE, record };
});

vi.mock("@/data/report3-copy", () => ({
  chapterCopy: (chapter: string) =>
    chapter === "typicalBeliefs"
      ? { "With Intro": record(true), "Without Intro": record(false) }
      : {},
}));

import { TYPICAL_BELIEFS_INTRO, buildTypicalBeliefs } from "@/data/report3-typical-beliefs";

describe("buildTypicalBeliefs — an archetype's own intro (Curious Apprentice, 01.10)", () => {
  it("opens on the archetype's own paragraphs, then its belief map, open or locked", () => {
    for (const locked of [false, true]) {
      expect(buildTypicalBeliefs("With Intro", { locked })!.intro).toEqual([...OWN_INTRO, ...LEDE]);
    }
  });

  it("keeps the four shared paragraphs where the archetype has none", () => {
    expect(buildTypicalBeliefs("Without Intro")!.intro).toEqual([
      ...TYPICAL_BELIEFS_INTRO,
      ...LEDE,
    ]);
  });
});
