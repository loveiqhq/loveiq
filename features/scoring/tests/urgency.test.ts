import { describe, expect, it } from "vitest";

import { getScoringConfig } from "@features/scoring/logic/config";
import { scoreArchetypes, urgencyFromOverlay } from "@features/scoring/logic/engine";

/**
 * Urgency (question 16002) was computed on every submission and then dropped into the
 * diagnostics bag, where nothing read it. These tests cover the promotion of that value
 * onto the result, and one trap in particular.
 */
describe("urgencyFromOverlay", () => {
  it("returns the answer on the 1-7 scale it was asked on", () => {
    // The engine works in 0-1; a product rule like "urgency 5 and above" is a sentence
    // about the question the respondent actually saw.
    expect(urgencyFromOverlay(0, false)).toBe(1);
    expect(urgencyFromOverlay(0.5, false)).toBe(4);
    expect(urgencyFromOverlay(1, false)).toBe(7);
  });

  it("round-trips every point on the scale", () => {
    for (let answer = 1; answer <= 7; answer += 1) {
      expect(urgencyFromOverlay((answer - 1) / 6, false)).toBe(answer);
    }
  });

  it("returns null when the question was not answered — NOT 4", () => {
    // The trap. An unanswered overlay defaults to 0.5 internally, which converts back to
    // a perfectly plausible mid-scale answer nobody gave. Anything gating on urgency has
    // to be able to tell "middling" from "unknown".
    expect(urgencyFromOverlay(0.5, true)).toBeNull();
    expect(urgencyFromOverlay(undefined, false)).toBeNull();
    expect(urgencyFromOverlay(Number.NaN, false)).toBeNull();
  });
});

describe("scoreArchetypes exposes urgency", () => {
  const config = getScoringConfig();

  it("surfaces the answer on the result, not just in diagnostics", () => {
    for (const answer of [1, 3, 5, 7]) {
      expect(scoreArchetypes(config, { "16002": answer }).urgency).toBe(answer);
    }
  });

  it("is null when 16002 is unanswered", () => {
    expect(scoreArchetypes(config, { "01005": 4 }).urgency).toBeNull();
  });

  it("still reports the raw overlay in diagnostics", () => {
    // Promoting the value must not remove it from where existing readers expect it.
    const result = scoreArchetypes(config, { "16002": 7 });
    expect(result.diagnostics.overlaysScalar.OVL_URGENCY).toBeCloseTo(1, 6);
  });

  it("does not change the archetype it picks", () => {
    // Urgency is a circumstance, not a trait. Exposing it must be inert for scoring.
    const withUrgency = scoreArchetypes(config, { "01005": 6, "16002": 7 });
    const without = scoreArchetypes(config, { "01005": 6 });
    expect(withUrgency.primaryArchetype).toBe(without.primaryArchetype);
  });
});
