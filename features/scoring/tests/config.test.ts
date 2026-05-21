import { describe, it, expect } from "vitest";
import { getScoringConfig } from "@features/scoring/logic/config";

describe("getScoringConfig", () => {
  const config = getScoringConfig();

  it("loads all required fields", () => {
    expect(config.modelParams).toBeDefined();
    expect(config.archetypes.length).toBeGreaterThan(0);
    expect(Object.keys(config.dimensions).length).toBeGreaterThan(0);
    expect(Object.keys(config.overlays).length).toBeGreaterThan(0);
    expect(config.prototypes.size).toBeGreaterThan(0);
    expect(config.boosts.size).toBeGreaterThan(0);
    expect(config.gates.length).toBeGreaterThan(0);
    expect(config.scalarMap.size).toBeGreaterThan(0);
    expect(config.enumMap.size).toBeGreaterThan(0);
    expect(config.weightModifiers.length).toBeGreaterThan(0);
    expect(config.knownQids.size).toBeGreaterThan(0);
    expect(Object.keys(config.labelToCode).length).toBeGreaterThan(0);
  });

  it("has 14 archetypes", () => {
    expect(config.archetypes).toHaveLength(14);
  });

  it("has 21 dimensions", () => {
    expect(Object.keys(config.dimensions)).toHaveLength(21);
  });

  it("includes the two new V6 dimensions", () => {
    expect(config.dimensions["DIM_CLOSENESS_ORIENTATION"]).toBeDefined();
    expect(config.dimensions["DIM_CLOSENESS_ORIENTATION"].qid).toBe("08004");
    expect(config.dimensions["DIM_CLOSENESS_ORIENTATION"].weight).toBe(1.0);
    expect(config.dimensions["DIM_PARTNER_FOCUS"]).toBeDefined();
    expect(config.dimensions["DIM_PARTNER_FOCUS"].qid).toBe("11003");
    expect(config.dimensions["DIM_PARTNER_FOCUS"].weight).toBe(1.2);
  });

  it("scalarizes the medication impact overlay and exposes its numeric map", () => {
    expect(config.overlays["OVL_MEDS_IMPACT"]).toBeDefined();
    expect(config.overlays["OVL_MEDS_IMPACT"].qid).toBe("15009");
    expect(config.overlays["OVL_MEDS_IMPACT"].transform).toBe("categorical_to_numeric");
    expect(config.scalarMap.get("OVL_MEDS_IMPACT||15009||no")).toBe(0);
    expect(config.scalarMap.get("OVL_MEDS_IMPACT||15009||lowers_drive")).toBe(1);
    expect(config.scalarMap.get("OVL_MEDS_IMPACT||15009||increases_drive")).toBe(1);
    expect(config.scalarMap.get("OVL_MEDS_IMPACT||15009||not_sure_effect")).toBe(0.6);
    expect(config.scalarMap.get("OVL_MEDS_IMPACT||15009||prefer_not")).toBe(0);
  });

  it("loads V5 categorical intercept calibration", () => {
    // V8 uses per-archetype v5_categorical_intercept_scale (V7 was a constant 0.5);
    // v5_categorical_intercept_subtract = expected_lift × scale per row.
    expect(config.v5CategoricalInterceptEnabled).toBe(true);
    expect(config.v5Calibration.size).toBe(14);
    expect(config.v5CategoricalInterceptByArchetype["Sensual Connector"]).toBeCloseTo(2.5863936, 6);
    expect(config.v5CategoricalInterceptByArchetype["Spark Seeker"]).toBeCloseTo(2.8870234, 6);
  });

  it("V8: per-archetype v5_categorical_intercept_scale is variable, not a V7 constant", () => {
    // V7 used a constant 0.5; V8 ranges 0.5103–1.8031 across the 14 archetypes.
    const scales = Array.from(config.v5Calibration.values()).map(
      (c) => c.v5CategoricalInterceptScale
    );
    expect(scales).toHaveLength(14);
    for (const s of scales) {
      expect(s).toBeGreaterThanOrEqual(0.5103);
      expect(s).toBeLessThanOrEqual(1.8031);
    }
    // Spread proves they are not a constant.
    const min = Math.min(...scales);
    const max = Math.max(...scales);
    expect(max - min).toBeGreaterThan(0.5);
  });

  it("V8: 12 gates load (was 9 in V7) with the 3 new V8 gates present", () => {
    expect(config.gates).toHaveLength(12);
    const newV8Gates = [
      { archetype: "Curious Apprentice", dimension: "DIM_TURNON_EXPRESS" },
      { archetype: "Emotional Voyeur", dimension: "DIM_EDGE_NEED" },
      { archetype: "Emotional Voyeur", dimension: "DIM_AVOIDANT" },
    ];
    for (const expected of newV8Gates) {
      const found = config.gates.find(
        (g) => g.archetype === expected.archetype && g.dimension === expected.dimension
      );
      expect(found).toBeDefined();
    }
  });

  it("V8: Emotional Voyeur DIM_AVOIDANT prototype is 0.8 (was 0.7 in V7)", () => {
    // V8 migration retuned this prototype value 0.7 → 0.8.
    expect(config.prototypes.get("Emotional Voyeur||DIM_AVOIDANT")).toBeCloseTo(0.8, 6);
  });

  it("V8: categorical boost score_add is applied as final post-scaled value", () => {
    // V8 reduced categorical_boost_rules to 6 columns; score_add is the final
    // post-scaled value (no external multiplier). Engine should use it as-is.
    // Sample boost: q03013 (gaze) "watched" → Radiant Performer.
    const watchedBoosts = config.boosts.get("03013||watched");
    expect(watchedBoosts).toBeDefined();
    const exhibBoost = watchedBoosts!.find((b) => b.archetype === "Radiant Performer");
    expect(exhibBoost).toBeDefined();
    // Boost values are bounded (V8 final values are typically -3 to +3).
    expect(Math.abs(exhibBoost!.scoreAdd)).toBeLessThanOrEqual(5);
    expect(exhibBoost!.scoreAdd).not.toBe(0);
  });

  it("has multiselectScoringQuestions with 3 questions", () => {
    expect(config.multiselectScoringQuestions).toBeInstanceOf(Set);
    expect(config.multiselectScoringQuestions.size).toBe(3);
    expect(config.multiselectScoringQuestions.has("03003")).toBe(true);
    expect(config.multiselectScoringQuestions.has("10002")).toBe(true);
    expect(config.multiselectScoringQuestions.has("14020")).toBe(true);
  });

  it("has no categorical boost rules for Q08004 or Q11003", () => {
    for (const key of config.boosts.keys()) {
      const qid = key.split("||")[0];
      expect(qid).not.toBe("08004");
      expect(qid).not.toBe("11003");
    }
  });

  it("every archetype has all 21 prototype values", () => {
    const dimIds = Object.keys(config.dimensions);
    for (const archetype of config.archetypes) {
      for (const dimId of dimIds) {
        const key = `${archetype}||${dimId}`;
        expect(config.prototypes.has(key)).toBe(true);
        const val = config.prototypes.get(key)!;
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
  });

  it("label-to-code map covers all categorical boost question IDs", () => {
    const boostQids = new Set<string>();
    for (const key of config.boosts.keys()) {
      boostQids.add(key.split("||")[0]);
    }
    for (const qid of boostQids) {
      expect(config.labelToCode[qid]).toBeDefined();
      expect(Object.keys(config.labelToCode[qid]).length).toBeGreaterThan(0);
    }
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const config2 = getScoringConfig();
    expect(config).toBe(config2);
  });

  it("all gate archetypes exist in archetypes list", () => {
    for (const gate of config.gates) {
      expect(config.archetypes).toContain(gate.archetype);
    }
  });

  it("all gate dimensions exist in dimensions", () => {
    for (const gate of config.gates) {
      expect(config.dimensions[gate.dimension]).toBeDefined();
    }
  });
});
