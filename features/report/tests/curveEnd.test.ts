import { describe, expect, it } from "vitest";
import { curveEndPoint, curveEndsWithPointCommand } from "@features/report/ui/curveEnd";
import { HIGHLIGHT_CURVES } from "@features/report/ui/sections/InsecuritiesSection";
import { ENERGY_GEOMETRY } from "@features/report/ui/sections/EnergySection";
import { ARC_GEOMETRY } from "@features/report/ui/sections/ArousalSection";

/**
 * Every curve whose end carries the reader's "you are here" dot, with the box it
 * has to land inside. If a dot ever leaves its line again, it will be because one
 * of these paths changed — and these bounds are what catches it.
 */
const CHARTS = [
  { name: "insecurities", paths: HIGHLIGHT_CURVES, key: null, box: { x: 778, yMin: 40, yMax: 60 } },
  {
    name: "energy",
    paths: ENERGY_GEOMETRY,
    key: "curve" as const,
    box: { x: 794, yMin: 50, yMax: 210 },
  },
  {
    name: "arousal",
    paths: ARC_GEOMETRY,
    key: "path" as const,
    box: { x: 829, yMin: 45, yMax: 105 },
  },
];

function pathsOf(chart: (typeof CHARTS)[number]): [string, string][] {
  return Object.entries(chart.paths).map(([k, v]) => [
    k,
    chart.key ? (v as Record<string, string>)[chart.key]! : (v as string),
  ]);
}

describe("curveEndPoint", () => {
  it("reads the end coordinate of each command type", () => {
    expect(curveEndPoint("M64 340 C189 329 254 149 368 106")).toEqual({ x: 368, y: 106 });
    expect(curveEndPoint("M0 0 L12 34")).toEqual({ x: 12, y: 34 });
    expect(curveEndPoint("M0 0 Q5 5 20 9")).toEqual({ x: 20, y: 9 });
    expect(curveEndPoint("M0 0 A240 240 0 0 1 186 32")).toEqual({ x: 186, y: 32 });
    expect(curveEndPoint("M7 8")).toEqual({ x: 7, y: 8 });
    // Negative and decimal coordinates must not be split apart.
    expect(curveEndPoint("M0 0 C1 1 2 2 -3.5 4.25")).toEqual({ x: -3.5, y: 4.25 });
  });

  it("flags the commands whose last two numbers are NOT an end point", () => {
    expect(curveEndsWithPointCommand("M64 340 C189 329 254 149 368 106")).toBe(true);
    expect(curveEndsWithPointCommand("M0 0 L10 10 H50")).toBe(false);
    expect(curveEndsWithPointCommand("M0 0 L10 10 V50")).toBe(false);
    expect(curveEndsWithPointCommand("M0 0 L10 10 Z")).toBe(false);
  });
});

describe("report chart dots sit on their curve", () => {
  for (const chart of CHARTS) {
    it(`${chart.name}: every variant ends where the dot is drawn`, () => {
      const entries = pathsOf(chart);
      expect(entries.length).toBeGreaterThan(2);
      for (const [key, d] of entries) {
        // The renderer derives the dot from the path, so the only way it can be
        // wrong is a path this helper cannot read.
        expect(curveEndsWithPointCommand(d), `${chart.name}/${key} ends on H/V/Z`).toBe(true);
        const end = curveEndPoint(d);
        expect(end.x, `${chart.name}/${key} end x`).toBe(chart.box.x);
        expect(end.y, `${chart.name}/${key} end y`).toBeGreaterThanOrEqual(chart.box.yMin);
        expect(end.y, `${chart.name}/${key} end y`).toBeLessThanOrEqual(chart.box.yMax);
      }
    });
  }

  it("keeps the four end points the old hardcoded lookup got wrong", () => {
    // Regression guard. `youY` used to be
    //   curveKey === "mid-riser" ? 52 : curveKey === "volatile" ? 50 : 46
    // over FIVE curves, so these three were drawn off their own line.
    expect(curveEndPoint(HIGHLIGHT_CURVES["late-accumulator"]!).y).toBe(58); // was 46 — 12px off
    expect(curveEndPoint(HIGHLIGHT_CURVES["climbing"]!).y).toBe(48); // was 46
    expect(curveEndPoint(HIGHLIGHT_CURVES["early-hot-riser"]!).y).toBe(44); // was 46
    expect(curveEndPoint(HIGHLIGHT_CURVES["mid-riser"]!).y).toBe(52); // was right
    expect(curveEndPoint(HIGHLIGHT_CURVES["volatile"]!).y).toBe(50); // was right
  });
});
