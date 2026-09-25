import { describe, expect, it } from "vitest";
import {
  boxFor,
  centreOf,
  inkOf,
  placeNames,
  spotBox,
  titleInkOf,
  type Box,
  type NameDot,
  type NameSize,
} from "@features/report/ui/v3/fantasyMapNames";
import { getFantasyMapDots } from "@features/report/server/fantasyMap";

/**
 * Where the fantasy map prints a name (Figma 696:4407). The boxes are checked
 * against Figma's own; the placement against the Spark Seeker's real map, where
 * V2's rule (every name centred under its dot) runs names over the next dot down.
 */

/** Manrope 9.5 on one line, measured in Chromium at 393 (25.09). */
const WIDTH: Readonly<Record<string, number>> = {
  "Emotional healing sex": 95.08,
  "Penetrating partner": 86.52,
  "Using toys on partner": 93.88,
  "Forced voyeurism fantasy": 111.5,
  "Breeding fantasy": 74.31,
  "Anal play (receiving)": 88.98,
  "Romantic dominance": 92.5,
  "Breasts / nipple play": 87.78,
};

/** The quadrant titles' boxes at a given plot size (measured at 300: 9 and 8 in). */
const titlesAt = (plot: number): Box[] => {
  const far = (plot + 4) / 2;
  return [
    [9, 8, 104.42],
    [far + 9, 8, 37.56],
    [9, far + 8, 82.06],
    [far + 9, far + 8, 67.23],
  ].map(([left, top, width]) => ({
    left: left!,
    top: top!,
    right: left! + width!,
    bottom: top! + 12,
  }));
};

const SPARK = getFantasyMapDots("Spark Seeker")!;
const ringOf = (q: string) => (q === "lean" ? 7.5 : 6.5);
const DOTS: NameDot[] = SPARK.map((d) => ({ x: d.x, y: d.y, r: ringOf(d.q) }));
const SIZES: (NameSize | null)[] = SPARK.map((d) =>
  d.label ? { width: WIDTH[d.label]!, height: 12 } : null
);

/** Boxes are float sums of Figma's fractions (0.88 * 300 is not exactly 264). */
const expectBox = (box: Box, want: Box) => {
  for (const side of ["left", "right", "top", "bottom"] as const) {
    expect(box[side], side).toBeCloseTo(want[side], 6);
  }
};

const meets = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** Whether a box reaches more than `allow` px into a ring. */
const coversRing = (box: Box, cx: number, cy: number, r: number, allow: number) =>
  Math.hypot(
    Math.max(box.left - cx, 0, cx - box.right),
    Math.max(box.top - cy, 0, cy - box.bottom)
  ) <
  r - allow;

/**
 * At 300 every name finds a spot clear of every ring. In the 257px plot of a 320px
 * phone one name has none: 87.3px lie between its dot and the next, its letters run
 * 87.8, and every other spot is worse. Half a pixel, there.
 */
const ALLOW: Readonly<Record<number, number>> = { 300: 0, 257: 0.5 };

describe("centreOf — Figma's mapping, a ring inside the edge", () => {
  it("puts an inside dot at its score over ten across the plot", () => {
    expect(centreOf({ x: 0.92, y: 0.12, r: 7.5 }, 300)).toEqual({ cx: 276, cy: 36 });
  });

  it("holds a ten a ring's radius inside the plot", () => {
    expect(centreOf({ x: 1, y: 0, r: 7.5 }, 300)).toEqual({ cx: 292.5, cy: 7.5 });
  });
});

describe("boxFor — each spot as 696:4407 draws it", () => {
  it("sets a name 2.5 off the ring, beside the dot and centred on it", () => {
    // Mutual surrender (696:4432): its box ends at 266 and spans 30-42.
    const left = boxFor({ x: 0.92, y: 0.12, r: 7.5 }, 300, "left", { width: 76, height: 12 });
    expectBox(left, { left: 190, right: 266, top: 30, bottom: 42 });
    // Public play (696:4435) starts at 63.
    const right = boxFor({ x: 0.18, y: 0.3, r: 6.5 }, 300, "right", { width: 49, height: 12 });
    expect(right.left).toBeCloseTo(63, 6);
    expect(right.top).toBeCloseTo(84, 6);
  });

  it("sets a name over or under the dot, flush with its right or centred", () => {
    // Slow builds (696:4436): 220-270, 80-92.
    expectBox(boxFor({ x: 0.88, y: 0.34, r: 7.5 }, 300, "above-end", { width: 50, height: 12 }), {
      left: 220,
      right: 270,
      top: 80,
      bottom: 92,
    });
    // Emotional release (696:4437): 173-252, 136-148.
    expectBox(boxFor({ x: 0.82, y: 0.42, r: 7.5 }, 300, "below-end", { width: 79, height: 12 }), {
      left: 173,
      right: 252,
      top: 136,
      bottom: 148,
    });
    // Voice & sound: centred under its dot at 192, 9 under the centre.
    const below = boxFor({ x: 0.64, y: 0.58, r: 6.5 }, 300, "below", { width: 62, height: 12 });
    expectBox(below, { left: 161, right: 223, top: 183, bottom: 195 });
  });
});

describe("placeNames — the Spark Seeker's own map", () => {
  for (const plot of [300, 257]) {
    it(`sets every name clear of every dot, name and title, inside a ${plot}px plot`, () => {
      const spots = placeNames(DOTS, SIZES, plot, titlesAt(plot));
      // Judged on the letters: a line's leading may lie on a neighbour (fantasyMapNames).
      const inks = spots.map((spot, i) =>
        spot ? inkOf(spotBox(DOTS[i]!, plot, spot, SIZES[i]!)) : null
      );
      inks.forEach((ink, i) => {
        if (!ink) return;
        const label = SPARK[i]!.label;
        expect(ink.left, label!).toBeGreaterThanOrEqual(0);
        expect(ink.top, label!).toBeGreaterThanOrEqual(0);
        expect(ink.right, label!).toBeLessThanOrEqual(plot);
        expect(ink.bottom, label!).toBeLessThanOrEqual(plot);
        DOTS.forEach((dot, j) => {
          if (j === i) return;
          const { cx, cy } = centreOf(dot, plot);
          expect(
            coversRing(ink, cx, cy, dot.r, ALLOW[plot]!),
            `${label} over ${SPARK[j]!.name}`
          ).toBe(false);
        });
        inks.forEach((other, j) => {
          if (other && j !== i)
            expect(meets(ink, other), `${label} / ${SPARK[j]!.label}`).toBe(false);
        });
        for (const title of titlesAt(plot)) {
          expect(meets(ink, titleInkOf(title)), `${label} on a title`).toBe(false);
        }
      });
    });
  }

  it("names only the dots the server named", () => {
    const spots = placeNames(DOTS, SIZES, 300, titlesAt(300));
    expect(spots.map((s) => s !== null)).toEqual(SPARK.map((d) => d.label !== null));
  });
});

describe("placeNames — the order it tries", () => {
  const one = (x: number, y: number) =>
    placeNames([{ x, y, r: 6.5 }], [{ width: 60, height: 12 }], 300);

  it("sets a lone name beside its dot, toward the plot's middle", () => {
    expect(one(0.8, 0.5)).toEqual([{ side: "left", shift: 0 }]);
    expect(one(0.2, 0.5)).toEqual([{ side: "right", shift: 0 }]);
  });

  it("goes under the dot when a neighbour takes the side toward the middle", () => {
    const places = placeNames(
      [
        { x: 0.8, y: 0.5, r: 6.5 },
        { x: 0.7, y: 0.5, r: 6.5 },
      ],
      [{ width: 60, height: 12 }, null],
      300
    );
    expect(places).toEqual([{ side: "below", shift: 0 }, null]);
  });

  it("gives the first name first pick, and the next one another spot", () => {
    // Each would take the side facing the other; the first name gets it.
    const places = placeNames(
      [
        { x: 0.5, y: 0.5, r: 6.5 },
        { x: 0.9, y: 0.5, r: 6.5 },
      ],
      [
        { width: 60, height: 12 },
        { width: 60, height: 12 },
      ],
      300
    );
    expect(places[0]).toEqual({ side: "right", shift: 0 });
    expect(places[1]!.side).not.toBe("left");
  });

  it("slides a name over or under its dot along, away from a neighbour", () => {
    // Beside it both ways and centred under it, a neighbour is in the way; slid, clear.
    const places = placeNames(
      [
        { x: 0.8, y: 0.5, r: 6.5 },
        { x: 0.7, y: 0.5, r: 6.5 },
        { x: 0.9, y: 0.5, r: 6.5 },
        { x: 0.75, y: 0.56, r: 6.5 },
      ],
      [{ width: 60, height: 12 }, null, null, null],
      300
    );
    expect(places[0]!.side).toBe("below");
    expect(places[0]!.shift).toBeGreaterThan(0);
    expect(Math.abs(places[0]!.shift)).toBeLessThanOrEqual(60 / 2 - 6);
  });

  it("still places a name where every spot is taken, on the one that covers least", () => {
    const crowd: NameDot[] = [{ x: 0.5, y: 0.5, r: 6.5 }];
    for (const [dx, dy] of [
      [-0.1, 0],
      [0.1, 0],
      [0, -0.06],
      [0, 0.06],
      [-0.1, -0.06],
      [0.1, 0.06],
      [-0.1, 0.06],
      [0.1, -0.06],
    ]) {
      crowd.push({ x: 0.5 + dx!, y: 0.5 + dy!, r: 6.5 });
    }
    const [place] = placeNames(crowd, [{ width: 60, height: 12 }], 300);
    expect(place).not.toBeNull();
  });
});
