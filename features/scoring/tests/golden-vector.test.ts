import { describe, it, expect } from "vitest";
import { scoreArchetypes } from "@features/scoring/logic/engine";
import { getScoringConfig } from "@features/scoring/logic/config";

/**
 * F-REG: golden-vector regression guard for the scoring engine.
 *
 * The rest of the scoring suite covers helpers + RELATIVE behaviour (gate
 * penalties, boosts, bias deltas). Nothing pinned the END-TO-END mapping
 * "this fixed answer vector → this primary archetype", so a bad CSV edit or a
 * generator regression could silently flip which archetype real users score
 * as, with every existing test still green.
 *
 * These vectors were captured against the V9 config on 2026-05-31. They use
 * BANDS (not exact percentages) so a benign config refresh doesn't trip them,
 * while a winner flip or a large distribution shift still does.
 *
 * IF ONE FAILS:
 *   - Intentional config/scoring change? Update the expectation in the SAME PR
 *     and note the V-bump + why the mapping moved.
 *   - Unexpected? You have a config regression — do NOT just bump the numbers.
 */
describe("scoring golden vectors (V9 regression guard)", () => {
  const config = getScoringConfig();

  // Distinct, strongly-discriminating vectors → distinct primaries. Proves the
  // engine differentiates archetypes, not just that it returns *something*.
  const GOLDEN: Array<{
    name: string;
    answers: Record<string, unknown>;
    primary: string;
    minPercent: number;
    maxPercent: number;
  }> = [
    {
      name: "withdrawn / avoidant profile",
      answers: { "08012": 7, "08006": 7, "10003": 1, "03012": 1, "15006": "Very high" },
      primary: "Quiet Withdrawer",
      minPercent: 25,
      maxPercent: 40,
    },
    {
      name: "high edge-need, low turn-on expression",
      answers: { "03012": 7, "10003": 1, "08012": 1 },
      primary: "Sensual Connector",
      minPercent: 16,
      maxPercent: 32,
    },
  ];

  for (const g of GOLDEN) {
    it(`maps "${g.name}" → ${g.primary}`, () => {
      const result = scoreArchetypes(config, g.answers as Parameters<typeof scoreArchetypes>[1]);
      expect(result.primaryArchetype).toBe(g.primary);
      const pct = result.percent[g.primary]!;
      expect(pct).toBeGreaterThanOrEqual(g.minPercent);
      expect(pct).toBeLessThanOrEqual(g.maxPercent);
      // Differentiation: the winner must sit well above the 14-way uniform
      // baseline (~7.14%), proving the vector actually discriminates.
      expect(pct).toBeGreaterThan(100 / 14 + 5);
    });
  }

  it("is deterministic — identical answers produce a bit-for-bit identical distribution", () => {
    const answers = { "08012": 7, "08006": 7, "10003": 1, "03012": 1, "15006": "Very high" };
    const a = scoreArchetypes(config, answers as Parameters<typeof scoreArchetypes>[1]);
    const b = scoreArchetypes(config, answers as Parameters<typeof scoreArchetypes>[1]);
    expect(a.percent).toEqual(b.percent);
    expect(a.primaryArchetype).toBe(b.primaryArchetype);
  });
});
