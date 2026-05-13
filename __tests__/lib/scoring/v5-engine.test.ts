import { describe, it, expect } from "vitest";
import { scoreArchetypes } from "@/lib/scoring/engine";
import { getScoringConfig } from "@/lib/scoring/config";
import type { ScoringConfig } from "@/lib/scoring/types";

const config = getScoringConfig();

// ─── V5 result structure ────────────────────────────────────────────────────

describe("V5 scoring result structure", () => {
  it("returns v5 field when V5 is enabled", () => {
    const result = scoreArchetypes(config, { "01005": 4 });
    expect(result.v5).toBeDefined();
  });

  it("v5 has 14 archetypes in finalPct", () => {
    const result = scoreArchetypes(config, { "01005": 4 });
    expect(Object.keys(result.v5!.finalPct)).toHaveLength(14);
  });

  it("v5 finalPct values are between 0 and 100", () => {
    const result = scoreArchetypes(config, { "01005": 6 });
    for (const pct of Object.values(result.v5!.finalPct)) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("v5 rawPct values are between 0 and 100", () => {
    const result = scoreArchetypes(config, { "01005": 6 });
    for (const pct of Object.values(result.v5!.rawPct)) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("v5 ranking has 14 entries", () => {
    const result = scoreArchetypes(config, { "01005": 4 });
    expect(result.v5!.ranking).toHaveLength(14);
  });

  it("v5 primaryArchetype equals first in ranking", () => {
    const result = scoreArchetypes(config, { "01005": 6 });
    expect(result.v5!.primaryArchetype).toBe(result.v5!.ranking[0]);
  });

  it("v5 finalPct values are rounded to 1 decimal place", () => {
    const result = scoreArchetypes(config, { "01005": 6, "03013": "watched" });
    for (const pct of Object.values(result.v5!.finalPct)) {
      expect(Math.round(pct * 10) / 10).toBe(pct);
    }
  });

  it("v5 diagnostics contains anchors, gaps, and fingerprint", () => {
    const result = scoreArchetypes(config, { "01005": 4 });
    expect(result.v5!.diagnostics.anchors).toBeDefined();
    expect(result.v5!.diagnostics.gaps).toBeDefined();
    expect(result.v5!.diagnostics.payloadFingerprint).toBeDefined();
  });
});

// ─── V5 does NOT sum to 100 ────────────────────────────────────────────────

describe("V5 independence (scores do not sum to 100)", () => {
  it("v5 finalPct values do not necessarily sum to 100", () => {
    const result = scoreArchetypes(config, { "01005": 6, "03013": "watched" });
    const sum = Object.values(result.v5!.finalPct).reduce((a, b) => a + b, 0);
    // V5 scores are independent — they should NOT sum to exactly 100
    // (they could by coincidence, but with spacing they'll typically be much less)
    expect(sum).not.toBeCloseTo(100, 0);
  });

  it("V4 percentages still sum to 100", () => {
    const result = scoreArchetypes(config, { "01005": 6, "03013": "watched" });
    const sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 1);
  });
});

// ─── V5 anchor mapping ─────────────────────────────────────────────────────

describe("V5 anchor-based percentage mapping", () => {
  it("neutral user (all 0.5) maps above baseline for most archetypes", () => {
    const result = scoreArchetypes(config, {});
    // A user at 0.5 on all dimensions is closer to center than a uniform random
    // user, so they score above the baseline (rawMean) for most archetypes.
    // Gate penalties may bring some below 50%.
    let aboveBaseline = 0;
    for (const archetype of config.archetypes) {
      expect(result.v5!.rawPct[archetype]).toBeGreaterThanOrEqual(0);
      expect(result.v5!.rawPct[archetype]).toBeLessThanOrEqual(100);
      if (result.v5!.rawPct[archetype] >= 50) aboveBaseline++;
    }
    // Most archetypes should be above 50% for a neutral user
    expect(aboveBaseline).toBeGreaterThanOrEqual(7);
  });

  it("anchors have rawMin < rawMean < rawMax for all archetypes", () => {
    const result = scoreArchetypes(config, { "01005": 4 });
    for (const archetype of config.archetypes) {
      const { rawMin, rawMean, rawMax } = result.v5!.diagnostics.anchors[archetype];
      expect(rawMin).toBeLessThan(rawMean);
      expect(rawMean).toBeLessThan(rawMax);
    }
  });

  it("perfect match archetype gets high raw percentage", () => {
    // Build a survey response that perfectly matches Spark Seeker's prototype
    // Spark Seeker: DIM_NOVELTY=0.83 (high), DIM_INTENSITY=0.84 (high)
    const result = scoreArchetypes(config, {
      "01005": 7, // DIM_NOVELTY → 1.0 (close to 0.83)
      "03008": 7, // DIM_INTENSITY → 1.0 (close to 0.84)
      "03009": 7, // DIM_PURSUIT → 1.0 (close to 0.79)
      "03012": 5, // DIM_EDGE_NEED → 0.67 (close to 0.60)
    });
    // Spark Seeker should score above the baseline (rawMean, 50%) for a matching profile.
    // V8 per-archetype intercept scale (Spark Seeker 1.2877 vs V7's constant 0.5)
    // compresses partial-profile scores closer to baseline, so we assert direction
    // rather than a tight upper bound.
    expect(result.v5!.rawPct["Spark Seeker"]).toBeGreaterThan(50);
  });
});

// ─── V5 deterministic spacing ───────────────────────────────────────────────

describe("V5 deterministic seeded spacing", () => {
  it("rank 1 keeps its raw_pct (after rounding)", () => {
    const result = scoreArchetypes(config, { "01005": 6 });
    const top = result.v5!.ranking[0];
    const rawRounded = Math.round(result.v5!.rawPct[top] * 10) / 10;
    expect(result.v5!.finalPct[top]).toBe(rawRounded);
  });

  it("each subsequent rank is below the previous by at least ~3.0", () => {
    const result = scoreArchetypes(config, {
      "01005": 6,
      "03013": "watched",
      "16005": "awakening",
    });
    const ranking = result.v5!.ranking;
    for (let i = 1; i < ranking.length; i++) {
      const prev = result.v5!.finalPct[ranking[i - 1]];
      const curr = result.v5!.finalPct[ranking[i]];
      if (curr > 0) {
        // Gap should be >= 3.0 (small tolerance for rounding)
        expect(prev - curr).toBeGreaterThanOrEqual(2.9);
      }
    }
  });

  it("gaps are between 3.0 and 4.0", () => {
    const result = scoreArchetypes(config, { "01005": 6 });
    for (const gap of Object.values(result.v5!.diagnostics.gaps)) {
      expect(gap).toBeGreaterThanOrEqual(3.0);
      expect(gap).toBeLessThanOrEqual(4.0);
    }
  });

  it("spacing is deterministic (same input = same output)", () => {
    const answers = { "01005": 6, "03013": "watched", "02001": "Spontaneous" };
    const r1 = scoreArchetypes(config, answers);
    const r2 = scoreArchetypes(config, answers);
    expect(r1.v5!.finalPct).toEqual(r2.v5!.finalPct);
    expect(r1.v5!.ranking).toEqual(r2.v5!.ranking);
    expect(r1.v5!.primaryArchetype).toBe(r2.v5!.primaryArchetype);
  });

  it("different inputs produce different spacing", () => {
    const r1 = scoreArchetypes(config, { "01005": 1 });
    const r2 = scoreArchetypes(config, { "01005": 7 });
    // Different inputs should produce different rankings or different scores
    const f1 = JSON.stringify(r1.v5!.finalPct);
    const f2 = JSON.stringify(r2.v5!.finalPct);
    expect(f1).not.toBe(f2);
  });
});

// ─── V5 does not affect V4 output ──────────────────────────────────────────

describe("V5 does not affect V4 output", () => {
  it("V4 percentages are identical with V5 enabled vs disabled", () => {
    const v4OnlyConfig: ScoringConfig = { ...config, v5Enabled: false };

    const answers = {
      "01005": 6,
      "03013": "watched",
      "16005": "awakening",
    };
    const withV5 = scoreArchetypes(config, answers);
    const withoutV5 = scoreArchetypes(v4OnlyConfig, answers);

    // V4 output must be bit-for-bit identical
    expect(withV5.rawScore).toEqual(withoutV5.rawScore);
    expect(withV5.percent).toEqual(withoutV5.percent);
    expect(withV5.primaryArchetype).toBe(withoutV5.primaryArchetype);
    expect(withV5.diagnostics).toEqual(withoutV5.diagnostics);
  });

  it("V5 disabled config returns no v5 field", () => {
    const v4OnlyConfig: ScoringConfig = { ...config, v5Enabled: false };
    const result = scoreArchetypes(v4OnlyConfig, { "01005": 4 });
    expect(result.v5).toBeUndefined();
  });
});

// ─── V5 no bias, no centering, no softmax ───────────────────────────────────

describe("V5 excludes V4-only features", () => {
  it("V5 rawTotal differs from V4 rawScore (no bias, no centering)", () => {
    const result = scoreArchetypes(config, {
      "01005": 6,
      "02001": "Spontaneous",
    });
    // V4 applies bias and centering; V5 does not
    // At least one archetype should have different raw scores
    let anyDifferent = false;
    for (const a of config.archetypes) {
      if (Math.abs(result.rawScore[a] - result.v5!.rawTotal[a]) > 0.001) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  it("applies the V5 categorical intercept before raw percentage mapping", () => {
    const withoutIntercept: ScoringConfig = {
      ...config,
      v5CategoricalInterceptEnabled: false,
    };
    const answers = {
      "02004": "I initiate",
      "03003": ["Visible or semi-public", "Novel or adventurous"],
      "03010": "Strong edge or taboo energy",
      "10002": ["Brief direct words", "Ongoing verbal feedback"],
      "14020": ["Novelty and discovery", "Pleasure and play"],
    };

    const withIntercept = scoreArchetypes(config, answers);
    const without = scoreArchetypes(withoutIntercept, answers);

    const sparkIntercept = config.v5CategoricalInterceptByArchetype["Spark Seeker"];
    expect(sparkIntercept).toBeGreaterThan(0);
    expect(
      without.v5!.rawTotal["Spark Seeker"] - withIntercept.v5!.rawTotal["Spark Seeker"]
    ).toBeCloseTo(sparkIntercept, 6);
    expect(withIntercept.v5!.rawPct["Spark Seeker"]).toBeLessThan(
      without.v5!.rawPct["Spark Seeker"]
    );
  });
});

// ─── V5 with weight modifiers ───────────────────────────────────────────────

describe("V5 with weight modifiers", () => {
  it("anchors change when weight modifiers fire", () => {
    const noStress = scoreArchetypes(config, { "15006": "Very low" });
    const highStress = scoreArchetypes(config, { "15006": "Very high" });

    // Under high stress, weights change → anchors should differ
    const archetype = config.archetypes[0];
    const noStressAnchor = noStress.v5!.diagnostics.anchors[archetype];
    const highStressAnchor = highStress.v5!.diagnostics.anchors[archetype];

    // rawMax = SUM(adj_w_d), which changes with weight modifiers
    expect(noStressAnchor.rawMax).not.toBe(highStressAnchor.rawMax);
  });

  it("medication impact now scalarizes and can trigger weight modifiers", () => {
    const baseline = scoreArchetypes(config, { "15009": "No" });
    const impacted = scoreArchetypes(config, { "15009": "Yes, lowers my drive" });

    expect(baseline.diagnostics.overlaysScalar.OVL_MEDS_IMPACT).toBeCloseTo(0, 6);
    expect(impacted.diagnostics.overlaysScalar.OVL_MEDS_IMPACT).toBeCloseTo(1, 6);
    expect(impacted.diagnostics.dimensionWeightsFinal.DIM_RESPONSIVE).toBeLessThan(
      baseline.diagnostics.dimensionWeightsFinal.DIM_RESPONSIVE
    );
    expect(impacted.diagnostics.dimensionWeightsFinal.DIM_INTENSITY).toBeLessThan(
      baseline.diagnostics.dimensionWeightsFinal.DIM_INTENSITY
    );
  });
});

// ─── V5 canonical fingerprint ───────────────────────────────────────────────

describe("V5 canonical payload fingerprint", () => {
  it("fingerprint is a non-empty string", () => {
    const result = scoreArchetypes(config, { "01005": 6 });
    expect(result.v5!.diagnostics.payloadFingerprint).toBeTruthy();
    expect(typeof result.v5!.diagnostics.payloadFingerprint).toBe("string");
  });

  it("fingerprint is deterministic", () => {
    const answers = { "01005": 6, "03013": "watched" };
    const r1 = scoreArchetypes(config, answers);
    const r2 = scoreArchetypes(config, answers);
    expect(r1.v5!.diagnostics.payloadFingerprint).toBe(r2.v5!.diagnostics.payloadFingerprint);
  });

  it("different answers produce different fingerprints", () => {
    const r1 = scoreArchetypes(config, { "01005": 1 });
    const r2 = scoreArchetypes(config, { "01005": 7 });
    expect(r1.v5!.diagnostics.payloadFingerprint).not.toBe(r2.v5!.diagnostics.payloadFingerprint);
  });

  it("empty answers produce empty fingerprint", () => {
    const result = scoreArchetypes(config, {});
    expect(result.v5!.diagnostics.payloadFingerprint).toBe("");
  });
});

// ─── V5 with full realistic survey ─────────────────────────────────────────

describe("V5 full realistic survey", () => {
  it("produces valid V5 output with comprehensive answers", () => {
    const result = scoreArchetypes(config, {
      "01005": 6,
      "02001": "Spontaneous",
      "02002": 5,
      "02003": 3,
      "03004": 6,
      "03008": 4,
      "03009": 3,
      "03010": "Balanced",
      "03011": 5,
      "03012": 2,
      "10003": 5,
      "10004": 6,
      "10005": 4,
      "11002": 3,
      "11004": 5,
      "08002": 6,
      "08005": 4,
      "08006": 3,
      "08012": 2,
      "09013": 2,
      "15006": "Medium",
      "15007": "Rested",
      "16005": "Awakening / Exploring",
    });

    // V5 structure
    expect(result.v5).toBeDefined();
    expect(Object.keys(result.v5!.finalPct)).toHaveLength(14);
    expect(result.v5!.ranking).toHaveLength(14);
    expect(config.archetypes).toContain(result.v5!.primaryArchetype);

    // All values in range
    for (const pct of Object.values(result.v5!.finalPct)) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }

    // V4 still valid
    const v4Sum = Object.values(result.percent).reduce((a, b) => a + b, 0);
    expect(v4Sum).toBeCloseTo(100, 1);
  });
});
