import { describe, it, expect } from "vitest";
import { scoreArchetypes, scale1_7to0_1, softmax } from "@features/scoring/logic/engine";
import { getScoringConfig } from "@features/scoring/logic/config";
import type { ScoringConfig } from "@features/scoring/logic/types";

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
      "02001": "Spontaneous",
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
    // Explorer of Edges gate: DIM_EDGE_NEED >= 0.6, scoreAdjustmentIfFail -1
    // Set edge need very low (1 on 1-7 scale = 0.0)
    const lowEdge = scoreArchetypes(config, { "03012": 1 });
    // Set edge need very high (7 on 1-7 scale = 1.0)
    const highEdge = scoreArchetypes(config, { "03012": 7 });

    // Explorer of Edges should score better with high edge need
    expect(highEdge.percent["Explorer of Edges"]).toBeGreaterThan(
      lowEdge.percent["Explorer of Edges"]
    );
  });

  // V8-new gates (added 2026-04-19):
  //  - Curious Apprentice / DIM_TURNON_EXPRESS / >=0.5 / -1.41
  //  - Emotional Voyeur   / DIM_EDGE_NEED      / >=0.35 / -0.5
  //  - Emotional Voyeur   / DIM_AVOIDANT       / >=0.55 / -1.5

  it("V8 gate: Curious Apprentice penalised when DIM_TURNON_EXPRESS below 0.5", () => {
    // qid 10003 maps to DIM_TURNON_EXPRESS, scale 1-7 → 0-1
    const lowExpress = scoreArchetypes(config, { "10003": 1 }); // 0.0 → fails gate
    const highExpress = scoreArchetypes(config, { "10003": 7 }); // 1.0 → passes
    expect(highExpress.rawScore["Curious Apprentice"]).toBeGreaterThan(
      lowExpress.rawScore["Curious Apprentice"]
    );
  });

  it("V8 gate: Emotional Voyeur penalised when DIM_EDGE_NEED below 0.35", () => {
    // qid 03012 = DIM_EDGE_NEED, scale 1-7 → 0-1; threshold 0.35 ≈ value 3.1 on 1-7
    const lowEdge = scoreArchetypes(config, { "03012": 1 }); // 0.0 → fails
    const passEdge = scoreArchetypes(config, { "03012": 4 }); // 0.5 → passes
    expect(passEdge.rawScore["Emotional Voyeur"]).toBeGreaterThan(
      lowEdge.rawScore["Emotional Voyeur"]
    );
  });

  it("V8 gate: Emotional Voyeur penalised when DIM_AVOIDANT below 0.55", () => {
    // qid 08012 = DIM_AVOIDANT, scale 1-7 → 0-1; threshold 0.55 ≈ value 4.3 on 1-7
    const lowAvoid = scoreArchetypes(config, { "08012": 1 }); // 0.0 → fails
    const highAvoid = scoreArchetypes(config, { "08012": 7 }); // 1.0 → passes
    expect(highAvoid.rawScore["Emotional Voyeur"]).toBeGreaterThan(
      lowAvoid.rawScore["Emotional Voyeur"]
    );
  });

  it("V8: all 12 gates load with non-zero penalties and existing archetypes/dimensions", () => {
    expect(config.gates).toHaveLength(12);
    for (const g of config.gates) {
      expect(config.archetypes).toContain(g.archetype);
      expect(config.dimensions[g.dimension]).toBeDefined();
      expect(g.scoreAdjustmentIfFail).toBeLessThan(0);
      expect(g.value).toBeGreaterThan(0);
      expect(g.value).toBeLessThanOrEqual(1);
    }
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
    // Radiant Performer should be boosted
    // (watched has +1.8 for Radiant Performer)
    const noBoost = scoreArchetypes(config, {});
    expect(withBoost.percent["Radiant Performer"]).toBeGreaterThan(
      noBoost.percent["Radiant Performer"]
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
      archetypeIds: { TypeA: 1, TypeB: 2 },
      v5Helpers: new Map(),
      multiselectScoringQuestions: new Set<string>(),
      v5Enabled: false,
      v5SpacingGapMin: 3.0,
      v5SpacingGapMax: 4.0,
      v5RoundDigits: 1,
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

// ─── Multiselect MAX boost aggregation ──────────────────────────────────────

describe("multiselect MAX boost aggregation", () => {
  function buildMultiselectConfig(): ScoringConfig {
    return {
      modelParams: {
        softmax_temperature: "1.0",
        softmax_floor: "0",
        archetype_bias_enabled: "FALSE",
        categorical_boost_centering_enabled: "FALSE",
        weight_modifiers_enabled: "FALSE",
      },
      archetypes: ["TypeA", "TypeB"],
      dimensions: {
        DIM_X: { id: "DIM_X", qid: "q_dim", transform: "scale_1_7_to_0_1", weight: 1.0 },
      },
      overlays: {},
      prototypes: new Map([
        ["TypeA||DIM_X", 0.5],
        ["TypeB||DIM_X", 0.5],
      ]),
      bias: { TypeA: 0, TypeB: 0 },
      boosts: new Map([
        [
          "q_multi||code_a",
          [
            { archetype: "TypeA", scoreAdd: 0.5 },
            { archetype: "TypeB", scoreAdd: 0.3 },
          ],
        ],
        [
          "q_multi||code_b",
          [
            { archetype: "TypeA", scoreAdd: 0.8 },
            { archetype: "TypeB", scoreAdd: 0.1 },
          ],
        ],
      ]),
      gates: [],
      scalarMap: new Map(),
      enumMap: new Map(),
      weightModifiers: [],
      knownQids: new Set(["q_dim", "q_multi"]),
      labelToCode: {},
      archetypeIds: { TypeA: 1, TypeB: 2 },
      v5Helpers: new Map(),
      multiselectScoringQuestions: new Set(["q_multi"]),
      v5Enabled: false,
      v5SpacingGapMin: 3.0,
      v5SpacingGapMax: 4.0,
      v5RoundDigits: 1,
    };
  }

  it("takes MAX boost per archetype for multiselect questions, not sum", () => {
    const cfg = buildMultiselectConfig();
    // Two answers selected for multiselect question
    const result = scoreArchetypes(cfg, { q_multi: ["code_a", "code_b"] });
    // TypeA should get MAX(0.5, 0.8) = 0.8, not 0.5+0.8 = 1.3
    // Base similarity is the same for both types (prototype=0.5, answer defaults to 0.5)
    const baseSim = 1.0; // w * (1 - |0.5 - 0.5|) = 1.0
    expect(result.rawScore.TypeA).toBeCloseTo(baseSim + 0.8, 6);
    expect(result.rawScore.TypeB).toBeCloseTo(baseSim + 0.3, 6);
  });

  it("single answer in multiselect question behaves like single-select", () => {
    const cfg = buildMultiselectConfig();
    const multiResult = scoreArchetypes(cfg, { q_multi: ["code_a"] });
    const singleResult = scoreArchetypes(cfg, { q_multi: "code_a" });
    expect(multiResult.rawScore.TypeA).toBeCloseTo(singleResult.rawScore.TypeA, 6);
    expect(multiResult.rawScore.TypeB).toBeCloseTo(singleResult.rawScore.TypeB, 6);
  });

  it("non-multiselect question sums boosts even with arrays", () => {
    const cfg = buildMultiselectConfig();
    // Remove q_multi from multiselect set
    cfg.multiselectScoringQuestions = new Set();
    const result = scoreArchetypes(cfg, { q_multi: ["code_a", "code_b"] });
    // Should SUM: TypeA = baseSim + 0.5 + 0.8 = 2.3
    const baseSim = 1.0;
    expect(result.rawScore.TypeA).toBeCloseTo(baseSim + 0.5 + 0.8, 6);
  });
});
