import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import {
  ENERGY_FAMILY_PROFILES,
  getEnergyFamilyProfile,
  type EnergyFamilyProfile,
} from "@/data/report2-energy";

type ConfigRow = {
  families?: { energy?: string } | null;
  energy_readouts?: { energy?: number; risk?: number; endurance?: number } | null;
};

const rows = Object.entries(config as Record<string, unknown>).filter(
  ([slug, value]) => !slug.startsWith("_") && !!value && typeof value === "object"
) as [string, ConfigRow][];

const READING_KEYS = ["energy", "risk", "endurance"] as const;

describe("report2 energy family profiles", () => {
  it("covers every archetype's families.energy value", () => {
    expect(rows).toHaveLength(14);
    for (const [slug, row] of rows) {
      const family = row.families?.energy;
      expect(family, `${slug} has no families.energy`).toBeTruthy();
      expect(
        ENERGY_FAMILY_PROFILES[family!],
        `${slug} → families.energy="${family}" has no profile`
      ).toBeDefined();
    }
  });

  it("reproduces the one real energy_readouts config exactly", () => {
    // Spiritual Lover is the only archetype with `energy_readouts`; the wave
    // profile must match it, which is what makes the other 13 trustworthy.
    const withConfig = rows.filter(([, row]) => !!row.energy_readouts);
    expect(withConfig).toHaveLength(1);

    const [slug, row] = withConfig[0]!;
    const profile = getEnergyFamilyProfile(row.families?.energy);
    for (const key of READING_KEYS) {
      expect(profile[key].level, `${slug} ${key} level`).toBe(row.energy_readouts![key]);
    }
  });

  it("gives every family three readings, both labels, and levels within 1–3", () => {
    for (const [family, profile] of Object.entries(ENERGY_FAMILY_PROFILES)) {
      const p = profile as EnergyFamilyProfile;
      expect(p.youLabel, `${family} youLabel`).toMatch(/^you — /);
      expect(p.contrastLabel.length, `${family} contrastLabel`).toBeGreaterThan(10);
      for (const key of READING_KEYS) {
        const reading = p[key];
        expect(reading.result.length, `${family}.${key} result`).toBeGreaterThan(3);
        expect(reading.detail.length, `${family}.${key} detail`).toBeGreaterThan(20);
        expect(reading.level, `${family}.${key} level`).toBeGreaterThanOrEqual(1);
        expect(reading.level, `${family}.${key} level`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("never prints a level word that contradicts its own meter", () => {
    // "High …" must fill all three segments, "Low …" exactly one — the defect
    // the Figma variant frames shipped (spike read "High" beside a 1-of-3 bar).
    for (const [family, profile] of Object.entries(ENERGY_FAMILY_PROFILES)) {
      for (const key of READING_KEYS) {
        const { result, level } = (profile as EnergyFamilyProfile)[key];
        if (/^High\b/.test(result)) expect(level, `${family}.${key} "${result}"`).toBe(3);
        else if (/^Low\b/.test(result) && !/then High/.test(result))
          expect(level, `${family}.${key} "${result}"`).toBe(1);
      }
    }
  });

  it("falls back to the Figma base for an unknown or missing family", () => {
    expect(getEnergyFamilyProfile(null)).toBe(ENERGY_FAMILY_PROFILES.wave);
    expect(getEnergyFamilyProfile("nope")).toBe(ENERGY_FAMILY_PROFILES.wave);
  });
});
