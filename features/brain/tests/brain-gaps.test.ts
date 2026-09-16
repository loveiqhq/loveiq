import { describe, expect, it } from "vitest";
import { rankGaps, type Gap } from "@/scripts/brain-gaps";

/**
 * The gaps report's only real logic. It decides what counts as a question the corpus
 * cannot answer, and in what order a person should read them — so getting it wrong means
 * either hiding a genuine gap or sending someone to index for a question nobody asks.
 */
const g = (over: Partial<Gap>): Gap => ({ question: "q", times: 1, score: 1.0, ...over });

describe("rankGaps", () => {
  it("keeps what falls below the floor and drops what clears it", () => {
    const out = rankGaps(
      [g({ question: "under", score: 1.84 }), g({ question: "over", score: 1.85 })],
      1.85
    );
    expect(out.map((x) => x.question)).toEqual(["under"]);
  });

  it("counts an empty result as a gap, not as a passing score", () => {
    // `null` means retrieval returned NOTHING. Coercing that to 0 would work by accident;
    // dropping it — the easy mistake — would hide the most complete failures there are.
    expect(rankGaps([g({ question: "nothing", score: null })], 1.85)).toHaveLength(1);
  });

  it("puts the most-asked gap first, because a gap asked six times is six failures", () => {
    const out = rankGaps(
      [
        g({ question: "once", times: 1, score: 1.1 }),
        g({ question: "often", times: 6, score: 1.8 }),
      ],
      1.85
    );
    expect(out[0]!.question).toBe("often");
  });

  it("breaks a tie on frequency with the worse score, so the clearest gap leads", () => {
    const out = rankGaps(
      [
        g({ question: "closer", times: 2, score: 1.8 }),
        g({ question: "worse", times: 2, score: 1.1 }),
      ],
      1.85
    );
    expect(out.map((x) => x.question)).toEqual(["worse", "closer"]);
  });
});
