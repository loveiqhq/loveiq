import { describe, expect, it } from "vitest";
import config from "@/data/report2-archetype-config.json";
import { CHART_FAMILIES } from "@features/report/ui/sections/InitiationSection";

const rows = Object.entries(
  config as Record<string, { families?: { initiation?: string } }>
).filter(([slug, v]) => !slug.startsWith("_") && !!v && typeof v === "object");

describe("report2 initiation families", () => {
  it("resolves every archetype's families.initiation", () => {
    expect(rows).toHaveLength(14);
    for (const [slug, v] of rows) {
      const family = v.families?.initiation;
      expect(family, `${slug} has no families.initiation`).toBeTruthy();
      expect(CHART_FAMILIES[family!], `${slug} → "${family}" has no chart`).toBeDefined();
    }
  });

  it("splits the 14 across the two Figma scales (10 / 4)", () => {
    const counts = rows.reduce<Record<string, number>>((acc, [, v]) => {
      const f = v.families!.initiation!;
      acc[f] = (acc[f] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ "lost-in-translation": 10, "heard-too-loudly": 4 });
  });

  it('heads the right column "What arrived" for both families', () => {
    // The mismatch is carried by the row values, not by relabelling the column;
    // heard-too-loudly used to read "What they heard", which is in no frame.
    for (const [family, chart] of Object.entries(CHART_FAMILIES)) {
      expect(chart.rightHeading, family).toBe("What arrived");
    }
  });

  it("carries the six Figma-verbatim row values per family", () => {
    expect(CHART_FAMILIES["heard-too-loudly"]!.rows).toEqual([
      { sent: "a clear move, said out loud", got: '"pressure"' },
      { sent: "a hand with stated intention", got: '"a demand to answer now"' },
      { sent: "an invitation without hedging", got: '"something to deflect"' },
    ]);
    expect(CHART_FAMILIES["lost-in-translation"]!.rows).toEqual([
      { sent: "a gaze held one beat longer", got: '"a calm evening"' },
      { sent: "a question that actually listened", got: '"good conversation"' },
      { sent: "a hand that wasn't in a hurry", got: '"affectionate, sleepy"' },
    ]);
  });

  it("keeps the two families' stories distinct", () => {
    const all = Object.values(CHART_FAMILIES).flatMap((c) =>
      c.rows.flatMap((r) => [r.sent, r.got])
    );
    expect(new Set(all).size, "a row value repeats across families").toBe(all.length);
  });
});
