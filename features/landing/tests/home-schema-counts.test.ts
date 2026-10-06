import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { getScoringConfig } from "@features/scoring/logic";

// Places that state, in user-visible or machine-readable copy, how many dimensions
// the assessment measures and how many archetypes it resolves to.
//
// These numbers drifted once already: the homepage JSON-LD claimed "14 psychological
// dimensions" (the ARCHETYPE count) and the survey confirmation said 19, both left
// behind by the V6 migration that took dimensions 19 -> 21. JSON-LD in particular is
// the string generative engines quote back, so a wrong number propagates outward.
//
// Each entry declares WHICH counts that file is expected to state. Declaring them is
// what makes deletion detectable: a file-level "states at least one count" check is
// not enough, because SurveyConfirmation names archetypes twice, so dropping only the
// dimension claim would otherwise leave this green.
//
// The counts stay literals in the source rather than being imported, because two of
// these are client components and data/scoring-config.ts is ~700KB — this guard keeps
// them honest without dragging the config into the browser bundle.
const FILES_STATING_COUNTS = [
  { file: "app/page.tsx", states: ["dimension", "archetype"] },
  { file: "features/survey/ui/SurveyConfirmation.tsx", states: ["dimension", "archetype"] },
] as const satisfies ReadonlyArray<{
  file: string;
  states: ReadonlyArray<"dimension" | "archetype">;
}>;

describe("stated dimension/archetype counts match scoring-config", () => {
  const config = getScoringConfig();
  const expected = {
    dimension: Object.keys(config.dimensions).length,
    archetype: config.archetypes.length,
  };

  // Comments are stripped: the homepage schema comment deliberately quotes the OLD
  // wrong number to explain the fix, and a guard that reads prose as if it were data
  // would fail on its own documentation.
  function copyOf(file: string): string {
    return readFileSync(join(process.cwd(), file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
  }

  /**
   * Every integer stated immediately before `dimension(s)`/`archetype(s)`, allowing up
   * to two adjectives between ("21 measured dimensions"). Reword-tolerant on purpose:
   * rephrasing the copy is free, changing the COUNT without changing scoring-config is not.
   */
  function statedCounts(source: string, noun: "dimension" | "archetype"): number[] {
    const re = new RegExp(String.raw`(\d+)\s+(?:\w+\s+){0,2}?${noun}s?\b`, "gi");
    return [...source.matchAll(re)].map((m) => Number(m[1]));
  }

  for (const { file, states } of FILES_STATING_COUNTS) {
    for (const noun of states) {
      it(`${file} states the right ${noun} count`, () => {
        const stated = [...new Set(statedCounts(copyOf(file), noun))];

        // Presence is asserted per-noun, so removing this claim fails here rather
        // than being masked by the file's other claim still being present.
        //
        // ponytail: presence is per-noun, not per claim-site. app/page.tsx states the
        // dimension count in BOTH the SoftwareApplication and the Quiz description, so
        // deleting one of the two is not detected while the other stands. A WRONG number
        // in either is detected, which is the failure mode that reaches engines and users.
        // Declare exact per-site counts here if a claim site ever goes silently missing.
        expect(stated, `${file} no longer states a ${noun} count`).not.toEqual([]);
        expect(stated, `${file} states the wrong ${noun} count`).toEqual([expected[noun]]);
      });
    }
  }

  it("the two counts are distinct, so conflating them is detectable", () => {
    expect(expected.dimension).not.toBe(expected.archetype);
  });
});
