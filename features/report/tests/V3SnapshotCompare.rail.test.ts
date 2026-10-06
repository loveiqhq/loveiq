import { describe, expect, it } from "vitest";
import { scaledRailFromStat } from "@features/report/ui/sections/SnapshotSection";

/** V3's third compare row — Figma 10392:19301 draws "8 of 20" as 10 dots, 4 on. */
describe("scaledRailFromStat", () => {
  it("reproduces the designer's third row", () => {
    expect(scaledRailFromStat("8 of 20")).toEqual({ total: 10, filled: 4 });
  });
  it("keeps small denominators one dot per unit", () => {
    expect(scaledRailFromStat("1 in 9")).toEqual({ total: 9, filled: 1 });
    expect(scaledRailFromStat("2 in 5")).toEqual({ total: 5, filled: 2 });
  });
  it("returns null when there is no ratio to draw, so the bar stays", () => {
    expect(scaledRailFromStat("55%")).toBeNull();
    expect(scaledRailFromStat("nearly all")).toBeNull();
    expect(scaledRailFromStat(undefined)).toBeNull();
  });
});
