import { describe, expect, it } from "vitest";

import { getScoringConfig } from "@features/scoring/logic/config";
import { focusPrimaryFromOverlay, scoreArchetypes } from "@features/scoring/logic/engine";

/**
 * `OVL_FOCUS_PRIMARY` (16001) and `OVL_BARRIER_TAGS` (16014) were both computed on every
 * submission and left in the diagnostics bag with nothing reading them — the same state
 * urgency was in. These cover promoting them onto the result.
 *
 * The one that carries real risk is focus: it is defined as the FIRST pick, so it is only
 * meaningful while the answer array stays in the order the respondent clicked.
 */
describe("focusPrimaryFromOverlay", () => {
  it("takes the first pick, not the last and not a join", () => {
    expect(focusPrimaryFromOverlay(["pleasure", "confidence"])).toBe("pleasure");
    expect(focusPrimaryFromOverlay(["confidence", "pleasure"])).toBe("confidence");
  });

  it("accepts a bare string, for a single pick", () => {
    expect(focusPrimaryFromOverlay("pleasure")).toBe("pleasure");
  });

  it("is null when nothing was picked", () => {
    expect(focusPrimaryFromOverlay([])).toBeNull();
    expect(focusPrimaryFromOverlay(null)).toBeNull();
    expect(focusPrimaryFromOverlay(undefined)).toBeNull();
    expect(focusPrimaryFromOverlay("")).toBeNull();
    expect(focusPrimaryFromOverlay(["   "])).toBeNull();
  });

  it("does not invent a value from a non-string first element", () => {
    expect(focusPrimaryFromOverlay([{ answer_code: "x" }])).toBeNull();
    expect(focusPrimaryFromOverlay([42])).toBeNull();
  });
});

describe("scoreArchetypes exposes focus and barrier", () => {
  const config = getScoringConfig();
  // Real 16001 labels — the question keeps all 11 options and they are not reworded, so
  // these have to stay resolvable for the overlay to produce anything.
  const PLEASURE = "More pleasure or easier orgasms";
  const CONFIDENCE = "Feeling more confident in my own body";

  it("reports the first-picked change on the result", () => {
    const result = scoreArchetypes(config, { "16001": [PLEASURE, CONFIDENCE] });
    expect(result.focusPrimary).not.toBeNull();
  });

  it("follows the pick order, so swapping the picks swaps the focus", () => {
    // The actual guarantee. If anything ever sorts the answer array — the client, the
    // API, a rehydration path — these two stop differing and this fails.
    const first = scoreArchetypes(config, { "16001": [PLEASURE, CONFIDENCE] }).focusPrimary;
    const second = scoreArchetypes(config, { "16001": [CONFIDENCE, PLEASURE] }).focusPrimary;
    expect(first).not.toBe(second);
  });

  it("is null when 16001 is unanswered", () => {
    expect(scoreArchetypes(config, { "16002": 4 }).focusPrimary).toBeNull();
  });

  it("exposes barrier tags as an array, empty when unanswered", () => {
    const answered = scoreArchetypes(config, {
      "16014": ["I'm not sure what would actually help"],
    });
    expect(Array.isArray(answered.barrierTags)).toBe(true);
    expect(scoreArchetypes(config, { "16002": 4 }).barrierTags).toEqual([]);
  });

  it("keeps both out of the way of the archetype itself", () => {
    // These are reporting overlays; no weight rule reads them. Adding them must not have
    // moved anyone's result.
    const withExtras = scoreArchetypes(config, {
      "16002": 4,
      "16001": [PLEASURE],
      "16014": ["I'm not sure what would actually help"],
    });
    const without = scoreArchetypes(config, { "16002": 4 });
    expect(withExtras.primaryArchetype).toBe(without.primaryArchetype);
    expect(withExtras.percent).toEqual(without.percent);
  });
});
