import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { POWER_ZONES, getPowerZone } from "@/data/report2-power-zones";

const rows = Object.entries(
  config as Record<string, { families?: { power_zone?: string } }>
).filter(([slug, v]) => !slug.startsWith("_") && !!v && typeof v === "object");

describe("report2 power zones", () => {
  it("resolves every archetype's families.power_zone", () => {
    expect(rows).toHaveLength(14);
    for (const [slug, v] of rows) {
      const zone = v.families?.power_zone;
      expect(zone, `${slug} has no families.power_zone`).toBeTruthy();
      expect(POWER_ZONES[zone!], `${slug} → "${zone}" has no zone entry`).toBeDefined();
    }
  });

  it("splits the 14 across the three Figma scales (10 / 2 / 2)", () => {
    const counts = rows.reduce<Record<string, number>>((acc, [, v]) => {
      const z = v.families!.power_zone!;
      acc[z] = (acc[z] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ switch: 10, "dominant-leaning": 2, "low-polarity": 2 });
  });

  it("keeps the Figma strings verbatim, label distinct from result", () => {
    // Regression guard: the eyebrow used to reuse the region word ("Switch",
    // "Leading"), which matched Figma for neither. Low-polarity is the case that
    // proves the two strings are not interchangeable.
    expect(getPowerZone("switch")).toEqual({
      label: "Devotional switch",
      result: "Devotional switch — presence-guided",
    });
    expect(getPowerZone("dominant-leaning")).toEqual({
      label: "Explicit lead",
      result: "Explicit lead — structure-guided",
    });
    expect(getPowerZone("low-polarity")).toEqual({
      label: "Low-polarity",
      result: "Gentle switch — comfort-guided",
    });
  });

  it("falls back to the base zone for unknown values and null for absent ones", () => {
    expect(getPowerZone("something-new")).toBe(POWER_ZONES.switch);
    expect(getPowerZone(null)).toBeNull();
    expect(getPowerZone("")).toBeNull();
    expect(getPowerZone(undefined)).toBeNull();
  });
});
