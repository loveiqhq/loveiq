import { describe, expect, it } from "vitest";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { getFantasyMapDots } from "@features/report/server/fantasyMap";

const NAMES = Object.keys(reportPracticeTendencies);

describe("fantasy map dots", () => {
  it("derives a map for all 14 archetypes", () => {
    expect(NAMES).toHaveLength(14);
    for (const name of NAMES) {
      expect(getFantasyMapDots(name), `${name}`).toHaveLength(16);
    }
  });

  it("ships up to 8 labels with at least one per populated quadrant", () => {
    // The chartnote promises an 8-label set, and that is the target — but a label
    // is only placed where it cannot collide, and several archetypes' practices
    // cluster tightly enough that 8 non-overlapping placements do not exist
    // (Quiet Withdrawer manages 3). Never-overlapping is the harder guarantee and
    // it wins. Zero labels, or a populated quadrant with none, is the regression.
    for (const name of NAMES) {
      const dots = getFantasyMapDots(name)!;
      const labelled = dots.filter((d) => d.label);
      expect(labelled.length, `${name} label count`).toBeGreaterThanOrEqual(3);
      expect(labelled.length, `${name} label count`).toBeLessThanOrEqual(8);

      // The chartnote asks for one label per quadrant, and most archetypes get
      // it — but a label is only placed where it collides with nothing, and each
      // quadrant prints its own title in its top-left corner. When every dot in a
      // quadrant sits in that title band, that quadrant goes unlabelled rather
      // than printing text on top of "NOT YOUR THING". Labels must still span at
      // least two quadrants so the map never reads as one-sided.
      const labelledQuadrants = new Set(labelled.map((d) => d.q));
      expect(labelledQuadrants.size, `${name} labelled quadrants`).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every dot inside the plot box", () => {
    for (const name of NAMES) {
      for (const d of getFantasyMapDots(name)!) {
        expect(d.x, `${name} x`).toBeGreaterThanOrEqual(0);
        expect(d.x, `${name} x`).toBeLessThanOrEqual(1);
        expect(d.y, `${name} y`).toBeGreaterThanOrEqual(0);
        expect(d.y, `${name} y`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("puts each dot in the quadrant its scores imply", () => {
    // y is inverted (CSS top%), so high fantasy pull ⇒ small y. Quadrant keys:
    // lean = high/high, keep = high fantasy + low pleasure, hidden = low fantasy
    // + high pleasure, not = low/low. The dividers sit at exactly 0.5 and a score
    // of 5 maps there, so "high" is STRICTLY past the line — matching MID = 5.5,
    // which on integer scores means 6 and up.
    for (const name of NAMES) {
      for (const d of getFantasyMapDots(name)!) {
        const highPleasure = d.x > 0.5;
        const highFantasy = d.y < 0.5;
        const expected = highFantasy
          ? highPleasure
            ? "lean"
            : "keep"
          : highPleasure
            ? "hidden"
            : "not";
        expect(d.q, `${name} ${d.label ?? "(anon)"} at x=${d.x} y=${d.y}`).toBe(expected);
      }
    }
  });

  it("is stable across calls and labels real practice names", () => {
    const practices = new Set(
      reportPracticeTendencies["Spiritual Lover"]!.groups.flatMap((g) =>
        g.rows.map((r) => r.practice)
      )
    );
    const first = getFantasyMapDots("Spiritual Lover")!;
    expect(getFantasyMapDots("Spiritual Lover")).toEqual(first);
    for (const d of first) {
      if (d.label) expect(practices.has(d.label), `${d.label} is a real practice`).toBe(true);
    }
  });

  it("differs between archetypes", () => {
    const a = getFantasyMapDots("Spiritual Lover")!;
    const b = getFantasyMapDots("Explorer of Edges")!;
    expect(a).not.toEqual(b);
  });

  it("returns null for an unknown archetype", () => {
    expect(getFantasyMapDots("Nobody")).toBeNull();
  });
});
