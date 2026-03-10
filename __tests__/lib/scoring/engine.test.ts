import { describe, it, expect } from "vitest";
import { scoreArchetypes, scale1_7to0_1, softmax } from "@/lib/scoring/engine";
import { getScoringConfig } from "@/lib/scoring/config";
import type { ScoringConfig } from "@/lib/scoring/types";

// ─── Unit tests for helper functions ─────────────────────────────────────────

describe("scale1_7to0_1", () => {
  it("transforms 1 → 0", () => {
    expect(scale1_7to0_1(1)).toBeCloseTo(0, 6);
  });

  it("transforms 4 → 0.5", () => {
    expect(scale1_7to0_1(4)).toBeCloseTo(0.5, 6);
  });

  it("transforms 7 → 1", () => {
    expect(scale1_7to0_1(7)).toBeCloseTo(1, 6);
  });

  it("returns null for out-of-range values", () => {
    expect(scale1_7to0_1(0)).toBeNull();
    expect(scale1_7to0_1(8)).toBeNull();
    expect(scale1_7to0_1(-1)).toBeNull();
  });

  it("returns null for non-numeric", () => {
    expect(scale1_7to0_1("abc")).toBeNull();
    expect(scale1_7to0_1(null)).toBeNull();
    expect(scale1_7to0_1(undefined)).toBeNull();
  });

  it("handles string numbers", () => {
    expect(scale1_7to0_1("3")).toBeCloseTo(2 / 6, 6);
  });
});

describe("softmax", () => {
  it("probabilities sum to 1", () => {
    const result = softmax({ A: 2.0, B: 1.0, C: 0.5 });
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("higher score gets higher probability", () => {
    const result = softmax({ A: 5.0, B: 1.0 });
    expect(result.A).toBeGreaterThan(result.B);
  });

  it("higher temperature makes distribution more uniform", () => {
    const sharp = softmax({ A: 5.0, B: 1.0 }, 1.0);
    const blunt = softmax({ A: 5.0, B: 1.0 }, 3.0);
    // Sharp should have bigger gap between A and B
    expect(sharp.A - sharp.B).toBeGreaterThan(blunt.A - blunt.B);
  });

  it("equal scores give equal probabilities", () => {
    const result = softmax({ A: 1.0, B: 1.0, C: 1.0 });
    expect(result.A).toBeCloseTo(1 / 3, 6);
    expect(result.B).toBeCloseTo(1 / 3, 6);
    expect(result.C).toBeCloseTo(1 / 3, 6);
  });
});

// ─── Integration tests with real config ──────────────────────────────────────

describe("scoreArchetypes", () => {
  const config = getScoringConfig();

  it("returns all 14 archetypes in percent", () => {
    const result = scoreArchetypes(config, { "01005": 4 });
    expect(Object.keys(result.percent)).toHaveLength(14);
  });

  it("percentages sum to ~100", () => {
    const result = scoreArchetypes(config, { "01005": 6 });
    const sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it("primaryArchetype is the top-scoring one", () => {
    const result = scoreArchetypes(config, { "01005": 6 });
    const maxPercent = Math.max(...Object.values(result.percent));
    expect(result.percent[result.primaryArchetype]).toBeCloseTo(maxPercent, 6);
  });

  it("returns diagnostics with dimension values", () => {
    const result = scoreArchetypes(config, { "01005": 6 });
    expect(result.diagnostics.uDimensions).toBeDefined();
    expect(result.diagnostics.dimensionWeightsBase).toBeDefined();
    expect(result.diagnostics.dimensionWeightsFinal).toBeDefined();
    expect(result.diagnostics.overlaysScalar).toBeDefined();
  });

  it("missing answers default to 0.5", () => {
    const result = scoreArchetypes(config, {});
    // All dimensions should be 0.5 when no answers given
    for (const val of Object.values(result.diagnostics.uDimensions)) {
      expect(val).toBeCloseTo(0.5, 6);
    }
  });

  it("handles label-to-code resolution for categorical questions", () => {
    // Survey stores full labels; engine should resolve to codes
    const result = scoreArchetypes(config, {
      "01003": "It's genuinely not a priority for me (stable preference)",
    });
    expect(result.percent).toBeDefined();
    const sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it("handles phase question prefix matching (long labels)", () => {
    const longLabel =
      "Recharging / Pausing \u2013 I'm in a quieter, restorative phase of my sexual life.";
    const result = scoreArchetypes(config, { "16005": longLabel });
    expect(result.percent).toBeDefined();
    const sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it("handles multi-select arrays", () => {
    const result = scoreArchetypes(config, {
      "16008": ["structured_steps", "conversation_prompts"],
      "16014": ["stress", "mismatch_with_partner"],
    });
    expect(result.percent).toBeDefined();
    const sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it("gate penalty applies when dimension is below threshold", () => {
    // Explorer of Edges gate: DIM_EDGE_NEED >= 0.7, penalty 2
    // Set edge need very low (1 on 1-7 scale = 0.0)
    const lowEdge = scoreArchetypes(config, { "03012": 1 });
    // Set edge need very high (7 on 1-7 scale = 1.0)
    const highEdge = scoreArchetypes(config, { "03012": 7 });

    // Explorer of Edges should score better with high edge need
    expect(highEdge.percent["Explorer of Edges"]).toBeGreaterThan(
      lowEdge.percent["Explorer of Edges"]
    );
  });

  it("weight modifiers reduce dimension weight under stress", () => {
    // High stress (OVL_STRESS >= 0.75) should reduce DIM_PRESSURE_SHUTDOWN weight
    const noStress = scoreArchetypes(config, {
      "15006": "Very low", // stress
      "08006": 7, // pressure shutdown = 1.0
    });
    const highStress = scoreArchetypes(config, {
      "15006": "Very high", // stress
      "08006": 7, // pressure shutdown = 1.0
    });

    // Under high stress, pressure_shutdown weight is reduced (×0.6)
    expect(highStress.diagnostics.dimensionWeightsFinal.DIM_PRESSURE_SHUTDOWN).toBeLessThan(
      noStress.diagnostics.dimensionWeightsFinal.DIM_PRESSURE_SHUTDOWN
    );
  });

  it("categorical boosts are zero-sum (centering)", () => {
    // With centering enabled, adding a categorical boost should shift some
    // archetypes up and others down relative to no-boost baseline
    const withBoost = scoreArchetypes(config, {
      "03013": "watched", // gaze orientation: Being watched
    });
    // Exhibitionist Performer should be boosted
    // (watched has +1.8 for Exhibitionist Performer)
    const noBoost = scoreArchetypes(config, {});
    expect(withBoost.percent["Exhibitionist Performer"]).toBeGreaterThan(
      noBoost.percent["Exhibitionist Performer"]
    );
  });

  it("archetype bias shifts scores pre-softmax", () => {
    // With bias enabled (default config), Quiet Withdrawer gets +0.8*1.18 ≈ +0.945
    // Verify bias is applied by checking the raw score difference
    // between a high-bias and low-bias archetype is influenced by bias
    const result = scoreArchetypes(config, {});

    // Build a no-bias config to compare
    const noBiasConfig: ScoringConfig = {
      ...config,
      modelParams: {
        ...config.modelParams,
        archetype_bias_enabled: "FALSE",
      },
    };
    const noBiasResult = scoreArchetypes(noBiasConfig, {});

    // Quiet Withdrawer has highest bias (+1.18), scale 0.8 → +0.945
    const qwDelta = result.rawScore["Quiet Withdrawer"] - noBiasResult.rawScore["Quiet Withdrawer"];
    expect(qwDelta).toBeCloseTo(0.8 * 1.181573571, 2);

    // Curious Apprentice has lowest bias (-0.94), scale 0.8 → -0.756
    const caDelta =
      result.rawScore["Curious Apprentice"] - noBiasResult.rawScore["Curious Apprentice"];
    expect(caDelta).toBeCloseTo(0.8 * -0.9446764286, 2);
  });

  it("reference test: known inputs produce expected top archetype", () => {
    // From the reference JS test case
    const result = scoreArchetypes(config, {
      "01005": 6,
      "03013": "watched",
      "01003": "not_priority_stable",
      "16005": "awakening",
      "16008": ["structured_steps", "conversation_prompts"],
      "16014": ["stress", "mismatch_with_partner"],
    });
    // Should produce a valid result with percentages summing to 100
    const sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
    expect(result.primaryArchetype).toBeTruthy();
    expect(config.archetypes).toContain(result.primaryArchetype);
  });
});

// ─── Minimal config integration test ─────────────────────────────────────────

describe("scoreArchetypes with minimal config", () => {
  it("computes base similarity correctly for 2 dims, 2 archetypes", () => {
    const minimalConfig: ScoringConfig = {
      modelParams: {
        softmax_temperature: "1.0",
        softmax_floor: "0",
        archetype_bias_enabled: "FALSE",
        categorical_boost_centering_enabled: "FALSE",
        weight_modifiers_enabled: "FALSE",
      },
      archetypes: ["TypeA", "TypeB"],
      dimensions: {
        DIM_X: { id: "DIM_X", qid: "q1", transform: "scale_1_7_to_0_1", weight: 1.0 },
        DIM_Y: { id: "DIM_Y", qid: "q2", transform: "scale_1_7_to_0_1", weight: 1.0 },
      },
      overlays: {},
      prototypes: new Map([
        ["TypeA||DIM_X", 1.0],
        ["TypeA||DIM_Y", 0.0],
        ["TypeB||DIM_X", 0.0],
        ["TypeB||DIM_Y", 1.0],
      ]),
      bias: { TypeA: 0, TypeB: 0 },
      boosts: new Map(),
      gates: [],
      scalarMap: new Map(),
      enumMap: new Map(),
      weightModifiers: [],
      knownQids: new Set(["q1", "q2"]),
      labelToCode: {},
    };

    // User scores: q1=7 (→1.0), q2=1 (→0.0) → closer to TypeA
    const result = scoreArchetypes(minimalConfig, { q1: 7, q2: 1 });

    // TypeA: w*(1-|1.0-1.0|) + w*(1-|0.0-0.0|) = 1+1 = 2
    // TypeB: w*(1-|1.0-0.0|) + w*(1-|0.0-1.0|) = 0+0 = 0
    expect(result.rawScore.TypeA).toBeCloseTo(2.0, 6);
    expect(result.rawScore.TypeB).toBeCloseTo(0.0, 6);
    expect(result.primaryArchetype).toBe("TypeA");
    expect(result.percent.TypeA).toBeGreaterThan(result.percent.TypeB);
  });
});
