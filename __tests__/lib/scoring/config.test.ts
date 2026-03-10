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

  it("has 19 dimensions", () => {
    expect(Object.keys(config.dimensions)).toHaveLength(19);
  });

  it("every archetype has all 19 prototype values", () => {
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
