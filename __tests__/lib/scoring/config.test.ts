import { describe, it, expect } from "vitest";
import { getScoringConfig } from "@/lib/scoring/config";

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
