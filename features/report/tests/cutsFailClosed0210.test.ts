import { describe, expect, it, vi } from "vitest";

/**
 * Final review of the archetypes' copy, 02.10: a record's `cuts` merged over the defaults
 * with a spread, so a field written as `undefined` (it type-checks: the cuts are Partial)
 * wiped out its default, and `gate()` with no count put every block in the clear for a
 * locked reader, the whole section shipped sharp. No file does that today; a transcription
 * that wrote "no marker" as `undefined` would have. A field left `undefined` now takes its
 * default, and `gate()` itself fails closed. Stand-in copy under a real archetype's name
 * (Fantasy vs. Reality draws its table from report-practice-tendencies), so no copy sits
 * in this test.
 */
const { NAME, records } = vi.hoisted(() => {
  const NAME = "Quiet Withdrawer";
  const para = (text: string) => ({ kind: "para" as const, runs: [{ text }] });
  const six = (what: string) => Array.from({ length: 6 }, (_, i) => para(`${what} ${i}.`));
  const rows = (kind: string) =>
    Array.from({ length: 5 }, (_, i) => ({ label: `${kind} ${i}`, subtext: `About ${i}.` }));
  const records: Record<string, unknown> = {
    typicalBeliefs: {
      lede: [{ kind: "heading", text: `The ${NAME} belief map`, level: 2 }, para("Lede.")],
      turns: Array.from({ length: 10 }, (_, i) => ({ shadow: `“S${i}.”`, shift: `“F${i}.”` })),
      sun: Array.from({ length: 10 }, (_, i) => `“Sun ${i}.”`),
      challenges: six("Challenge"),
      practice: six("Practice"),
      cuts: { challengesFree: undefined, practiceFree: undefined },
    },
    accelerators: {
      intro: [para("Intro.")],
      brakes: rows("Brake"),
      accelerators: rows("Accelerator"),
      challenges: six("Challenge"),
      practice: six("Practice"),
      cuts: { challengesFree: undefined, practiceFree: undefined, practiceRampThrough: undefined },
    },
    partnership: {
      body: six("Body"),
      loop: Array.from({ length: 6 }, (_, i) => ({ happens: `H${i}.`, underneath: `U${i}.` })),
      result: para("Result."),
      practice: six("Practice"),
      cuts: { freeBlocks: undefined, rampThrough: undefined, practiceFree: undefined },
    },
    fantasy: {
      intro: [para("Intro.")],
      challenges: [{ kind: "heading", text: "Common challenges" }, ...six("Challenge")],
      practice: six("Practice"),
      cuts: { practiceFree: undefined },
    },
  };
  return { NAME, records };
});

vi.mock("@/data/report3-copy", () => ({
  chapterCopy: (chapter: string) => ({ [NAME]: records[chapter] }),
}));

import {
  ACCELERATORS_CHALLENGES_FREE_BLOCKS,
  buildAccelerators,
} from "@/data/report3-accelerators";
import { FANTASY_PRACTICE_FREE_BLOCKS, buildFantasy } from "@/data/report3-fantasy";
import { PARTNERSHIP_FREE_BLOCKS, buildPartnership } from "@/data/report3-partnership";
import {
  TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS,
  TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS,
  buildTypicalBeliefs,
} from "@/data/report3-typical-beliefs";
import { gate } from "@features/report/server/gatedCopy";

describe("a cut written as undefined takes its default (final review 02.10)", () => {
  it("Typical Beliefs keeps its walls", () => {
    const view = buildTypicalBeliefs(NAME, { locked: true })!;
    expect(view.challenges.free).toHaveLength(TYPICAL_BELIEFS_CHALLENGES_FREE_BLOCKS);
    expect(view.practice.free).toHaveLength(TYPICAL_BELIEFS_PRACTICE_FREE_BLOCKS);
  });

  it("Accelerators & Brakes keeps its walls", () => {
    const view = buildAccelerators(NAME, { locked: true })!;
    expect(view.challenges.free).toHaveLength(ACCELERATORS_CHALLENGES_FREE_BLOCKS);
    expect(view.challenges.ramp).not.toBeNull();
  });

  it("Challenges in Partnerships keeps its wall", () => {
    const view = buildPartnership(NAME, { locked: true })!;
    expect(view.body.free).toHaveLength(PARTNERSHIP_FREE_BLOCKS);
    expect(view.body.ramp).not.toBeNull();
  });

  it("Fantasy vs. Reality keeps its wall", () => {
    const view = buildFantasy(NAME, { locked: true })!;
    expect(view.practice.free).toHaveLength(FANTASY_PRACTICE_FREE_BLOCKS);
    expect(view.practice.ramp).not.toBeNull();
  });
});

describe("gate() fails closed", () => {
  it("keeps a locked passage behind the wall when its cut is not a count", () => {
    const blocks = [0, 1, 2].map((i) => ({ kind: "para" as const, runs: [{ text: `B${i}.` }] }));
    for (const cut of [undefined, Number.NaN, -1, 1.5]) {
      const view = gate(blocks, cut as unknown as number, true);
      expect(view.free, String(cut)).toEqual([]);
      expect(view.ramp, String(cut)).toEqual(blocks[0]);
      expect(view.rest, String(cut)).toHaveLength(2);
    }
  });
});
