/**
 * Where each printed name sits on the fantasy map — Report V4 (Figma 696:4407).
 *
 * getFantasyMapDots picks which eight of a reader's sixteen dots are named, spacing
 * the names for V2's rule: centred under the dot. A reader's scores are whole
 * numbers, so their dots sit on a grid a tenth of the plot apart, and a name under
 * one ran over the next dot down (V2 does the same). Figma sets each name beside its
 * dot, toward the plot's middle, or over or under it — centred, or slid along to
 * hang past the dot's side — where a neighbour is in the way. So each name tries
 * those spots in that order and takes the first where its letters cover no other
 * dot, no other name and no quadrant title, inside the plot. Failing all, it is not
 * printed — V2's own rule, fewer labels rather than overlapping ones — and its dot
 * keeps its readout and its screen-reader label.
 *
 * Pure, so it is tested apart from the page; the map measures the names and the
 * plot and hands them in.
 */

/** A name's side of its dot; "end" names sit flush with the dot's right (696:4436/4437). */
export type NamePlace = "left" | "right" | "above" | "below" | "above-end" | "below-end";

/** Where the placer puts a name: a side, and for a name over or under, a slide in px. */
export interface NameSpot {
  side: "left" | "right" | "above" | "below";
  shift: number;
}

/** A dot: its place on the plot (0..1 each way) and its ring's radius in px. */
export interface NameDot {
  x: number;
  y: number;
  r: number;
}

export interface NameSize {
  width: number;
  height: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Name to ring, as 696:4407 sets every name. */
export const NAME_GAP = 2.5;
/** How far an "end" name reaches past the dot's centre (696:4436/4437). */
export const NAME_REACH = 6;
/** The steps a name over or under its dot slides in. */
const SLIDE = 4;
/** Room kept clear around another dot's ring and between two names. */
const CLEAR = 1;
/**
 * Of that room, what a name may still take by a ring: a spot whose letters keep half
 * a pixel off it is clear. Rejecting a tenth-of-a-pixel touch sent one name over its
 * dot and left the next with nowhere but off the plot (final review 2, 25.09).
 */
const RING_GRACE = 0.5;
/**
 * The letters inside a name's 12px line (Manrope 9.5, the baseline 9.64 down):
 * capitals from 2.8, descenders to 11.6. The line's leading may lie on a neighbour;
 * the letters are what must stay clear.
 */
const NAME_INK = { top: 2.8, bottom: 0.4 };
/** A quadrant title's capitals in its 12px line (Manrope Bold 9, baseline 9.45). */
const TITLE_INK = { top: 2.97, bottom: 2.55 };

/** A name's letters, from the box it takes. */
export const inkOf = (box: Box): Box => ({
  ...box,
  top: box.top + NAME_INK.top,
  bottom: box.bottom - NAME_INK.bottom,
});

/** A quadrant title's letters, from its line box. */
export const titleInkOf = (box: Box): Box => ({
  ...box,
  top: box.top + TITLE_INK.top,
  bottom: box.bottom - TITLE_INK.bottom,
});

/** A dot's centre in px: the plot's own mapping, held a ring inside its edge (as the CSS). */
export function centreOf(dot: NameDot, plot: number): { cx: number; cy: number } {
  const clamp = (v: number) => Math.min(plot - dot.r, Math.max(dot.r, v * plot));
  return { cx: clamp(dot.x), cy: clamp(dot.y) };
}

/** The line box a name takes at `place`, in plot px. */
export function boxFor(dot: NameDot, plot: number, place: NamePlace, size: NameSize): Box {
  const { cx, cy } = centreOf(dot, plot);
  const off = dot.r + NAME_GAP;
  const { width: w, height: h } = size;
  const across = (left: number) => ({ left, right: left + w });
  const high = (top: number) => ({ top, bottom: top + h });
  switch (place) {
    case "left":
      return { ...across(cx - off - w), ...high(cy - h / 2) };
    case "right":
      return { ...across(cx + off), ...high(cy - h / 2) };
    case "above":
      return { ...across(cx - w / 2), ...high(cy - off - h) };
    case "below":
      return { ...across(cx - w / 2), ...high(cy + off) };
    case "above-end":
      return { ...across(cx + NAME_REACH - w), ...high(cy - off - h) };
    case "below-end":
      return { ...across(cx + NAME_REACH - w), ...high(cy + off) };
  }
}

/** The line box a name takes at a placer's spot. */
export function spotBox(dot: NameDot, plot: number, spot: NameSpot, size: NameSize): Box {
  const box = boxFor(dot, plot, spot.side, size);
  return { ...box, left: box.left + spot.shift, right: box.right + spot.shift };
}

/**
 * Beside the dot toward the middle; under it, centred and then slid inward and
 * outward as far as it still hangs over the dot; over it the same way; then the far
 * side.
 */
function spotsFor(dot: NameDot, size: NameSize): NameSpot[] {
  const inward = dot.x > 0.5 ? -1 : 1;
  const reach = Math.max(0, size.width / 2 - NAME_REACH);
  const shifts = [0];
  for (const way of [inward, -inward]) {
    for (let step = SLIDE; step < reach + SLIDE; step += SLIDE) {
      shifts.push(way * Math.min(step, reach));
    }
  }
  const slid = [...new Set(shifts)];
  return [
    { side: inward < 0 ? "left" : "right", shift: 0 },
    ...slid.map((shift) => ({ side: "below" as const, shift })),
    ...slid.map((shift) => ({ side: "above" as const, shift })),
    { side: inward < 0 ? "right" : "left", shift: 0 },
  ];
}

const meets = (a: Box, b: Box): boolean =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) + CLEAR > 0 &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + CLEAR > 0;

/** Whether a box comes nearer a ring than the room kept round it, less the grace. */
function onRing(box: Box, cx: number, cy: number, r: number): boolean {
  const dx = Math.max(box.left - cx, 0, cx - box.right);
  const dy = Math.max(box.top - cy, 0, cy - box.bottom);
  return Math.hypot(dx, dy) < r + CLEAR - RING_GRACE;
}

/**
 * A spot for every named dot, in the dots' own order — the server's, most
 * characteristic first — so an earlier name has first pick. Null for an unnamed dot,
 * and for a name with no clear spot, which then goes unprinted. `titles` are the
 * quadrant titles' line boxes; every test is on the letters.
 */
export function placeNames(
  dots: readonly NameDot[],
  sizes: readonly (NameSize | null)[],
  plot: number,
  titles: readonly Box[] = []
): (NameSpot | null)[] {
  const centres = dots.map((dot) => centreOf(dot, plot));
  const titleInks = titles.map(titleInkOf);
  const placed: Box[] = [];
  const clear = (ink: Box, i: number) =>
    ink.left >= 0 &&
    ink.top >= 0 &&
    ink.right <= plot &&
    ink.bottom <= plot &&
    centres.every((c, j) => j === i || !onRing(ink, c.cx, c.cy, dots[j]!.r)) &&
    placed.every((other) => !meets(ink, other)) &&
    titleInks.every((title) => !meets(ink, title));
  return dots.map((dot, i) => {
    const size = sizes[i];
    if (!size) return null;
    for (const spot of spotsFor(dot, size)) {
      const ink = inkOf(spotBox(dot, plot, spot, size));
      if (clear(ink, i)) {
        placed.push(ink);
        return spot;
      }
    }
    return null;
  });
}
