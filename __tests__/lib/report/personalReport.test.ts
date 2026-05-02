import { describe, expect, it } from "vitest";
import {
  resolveUnlockedArchetypeTiers,
  resolveUnlockedArchetypes,
} from "@/lib/report/personalReport";

describe("resolveUnlockedArchetypeTiers", () => {
  it("returns archetype_tiers as-is when DB column is populated", () => {
    expect(
      resolveUnlockedArchetypeTiers({
        accessPlan: "essentials",
        archetypeTiers: { "Sensual Connector": "essentials" },
        columnValues: ["Sensual Connector"],
        primaryArchetype: "Sensual Connector",
      })
    ).toEqual({ "Sensual Connector": "essentials" });
  });

  it("ignores stale legacy column entries when archetype_tiers is non-empty", () => {
    // User owns Essentials for primary X (Sensual Connector). Legacy
    // unlocked_archetypes column has a phantom Y (Spark Seeker) — e.g. from
    // pre-migration seed data, manual SQL, or partial sync. The new column
    // is the source of truth: Y must NOT be promoted to full_report.
    expect(
      resolveUnlockedArchetypeTiers({
        accessPlan: "essentials",
        archetypeTiers: { "Sensual Connector": "essentials" },
        columnValues: ["Sensual Connector", "Spark Seeker"],
        primaryArchetype: "Sensual Connector",
      })
    ).toEqual({ "Sensual Connector": "essentials" });
  });

  it("falls back to legacy column only when archetype_tiers is empty", () => {
    // Pre-migration row that somehow missed the backfill: archetype_tiers='{}'
    // but legacy column still has data. Treat all legacy entries as
    // full_report unlocks (the legacy contract).
    expect(
      resolveUnlockedArchetypeTiers({
        accessPlan: null,
        archetypeTiers: {},
        columnValues: ["Sensual Connector", "Spark Seeker"],
        primaryArchetype: "Sensual Connector",
      })
    ).toEqual({
      "Sensual Connector": "full_report",
      "Spark Seeker": "full_report",
    });
  });

  it("seeds primary archetype tier from accessPlan when missing", () => {
    expect(
      resolveUnlockedArchetypeTiers({
        accessPlan: "full_report",
        archetypeTiers: {},
        columnValues: [],
        primaryArchetype: "Sensual Connector",
      })
    ).toEqual({ "Sensual Connector": "full_report" });
  });

  it("all_reports promotes every known archetype to full_report", () => {
    const result = resolveUnlockedArchetypeTiers({
      accessPlan: "all_reports",
      archetypeTiers: { "Sensual Connector": "essentials" },
      columnValues: [],
      primaryArchetype: "Sensual Connector",
    });
    expect(result["Sensual Connector"]).toBe("full_report");
    expect(result["Spark Seeker"]).toBe("full_report");
    expect(Object.keys(result).length).toBe(14);
  });

  it("primary tier never downgrades from full_report to essentials", () => {
    expect(
      resolveUnlockedArchetypeTiers({
        accessPlan: "essentials",
        archetypeTiers: { "Sensual Connector": "full_report" },
        columnValues: [],
        primaryArchetype: "Sensual Connector",
      })
    ).toEqual({ "Sensual Connector": "full_report" });
  });
});

describe("resolveUnlockedArchetypes", () => {
  it("includes only the primary when no purchases exist", () => {
    expect(
      resolveUnlockedArchetypes({
        accessPlan: null,
        archetypeTiers: {},
        columnValues: [],
        primaryArchetype: "Sensual Connector",
      })
    ).toEqual(["Sensual Connector"]);
  });

  it("does not leak phantom legacy entries into the unlocked list", () => {
    expect(
      resolveUnlockedArchetypes({
        accessPlan: "essentials",
        archetypeTiers: { "Sensual Connector": "essentials" },
        columnValues: ["Sensual Connector", "Spark Seeker"],
        primaryArchetype: "Sensual Connector",
      })
    ).toEqual(["Sensual Connector"]);
  });

  it("returns every known archetype for all_reports", () => {
    const result = resolveUnlockedArchetypes({
      accessPlan: "all_reports",
      archetypeTiers: {},
      columnValues: [],
      primaryArchetype: "Sensual Connector",
    });
    expect(result.length).toBe(14);
  });
});
