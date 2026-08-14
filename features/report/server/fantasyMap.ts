import { reportPracticeTendencies } from "@/data/report-practice-tendencies";

/**
 * Per-archetype dots for the fantasy map (Figma 8427:2479, "Interactive map of
 * practices by fantasy pull and lived pleasure").
 *
 * `report2-archetype-config.json` has `fantasy_map` for Spiritual Lover only,
 * and even that entry is just meta: `{note: "dot positions + 8-label set per
 * archetype from scored data", labels_min_per_quadrant: 1}`. The scored data it
 * refers to already exists — `data/report-practice-tendencies.ts` carries
 * `fantasyPull` + `actualPleasure` (1–10) for 89 practices × all 14 archetypes,
 * generated from the product team's source docs — and those are exactly the two
 * map axes. So the dots are DERIVED here rather than hand-authored: no position
 * is invented.
 *
 * This also makes the section honour its own chartnote, which already promises
 * "placements start from your archetype's typical pattern" and "label positions
 * are data per archetype. Each report ships its own 8-label set (one per
 * quadrant minimum)". Before this, every archetype got one fixed illustrative
 * layout, contradicting that copy.
 *
 * MUST stay server-only: the practice-tendency module is ~342KB.
 */

export type FantasyQuadrant = "lean" | "keep" | "hidden" | "not";

export interface FantasyMapDot {
  /** Practice name, or null for an anonymous context dot. */
  label: string | null;
  q: FantasyQuadrant;
  /** 0..1 across the plot box — lived pleasure. */
  x: number;
  /** 0..1 down the plot box (CSS top%) — inverted fantasy pull. */
  y: number;
}

/** Midpoint of the 1–10 scale; splits the four quadrants. */
const MID = 5.5;
const TOTAL_DOTS = 16;
const PER_QUADRANT = 4;
const LABELS_PER_QUADRANT = 2;
const TOTAL_LABELS = 8;
/*
 * Figma's own footer gives the mapping verbatim: "each archetype re-plots every
 * dot from its own scored data (x = lived pleasure / 10, y = 1 - fantasy pull /
 * 10) and each dot recolours to the quadrant it lands in" (9116:852). So a 1-10
 * score maps to 0.1-1.0 across the plot box — NOT an inset range. The quadrant
 * dividers sit at exactly 0.5, which is why MID is 5.5: on integer scores that
 * puts 6+ clearly right of the line and 5 on it.
 */
/**
 * Minimum distance from a side before a dot may carry a label. The label is
 * centred under the dot and capped at ~32% of the plot box, so it needs ~16%
 * clear on each side.
 */
const SIDE_CLEARANCE = 0.17;
/**
 * A label's footprint as a fraction of the plot box, taken from the narrowest
 * (mobile) map where it is relatively largest. MEASURED in the browser rather
 * than estimated, against the DOTS LAYER (not the map — the layer is inset).
 * Mobile is the binding case: a 70x21px label in the layer's 268x250px box is
 * 0.261 x 0.084; desktop is 132x31 in ~633x483 (0.209 x 0.064). Rounded up for
 * headroom but deliberately kept BELOW 0.3 and 0.1: scores are integers, so two
 * dots three pleasure points apart sit exactly 0.3 apart and one fantasy row
 * apart is exactly 0.1, and both must stay placeable. The label CSS is sized to
 * hold this true — at 25px tall the mobile label measured 0.100 and every
 * adjacent row collided. The label box is fixed width and clamped to two lines precisely so
 * this stays true as practice names vary.
 * Used to measure label separation in "label boxes" — see `separation`.
 */
const LABEL_W = 0.28;
const LABEL_H = 0.096;
/**
 * Footprint of a quadrant's own title, measured from its top-left corner as a
 * fraction of the WHOLE plot box (each quadrant is half the box on each axis).
 * "KEEP IN IMAGINATION" is the longest at ~129px of the 835px frame.
 */
const TITLE_W = 0.34;
const TITLE_H = 0.09;
/** Gap between a dot's centre and the top of its label, in plot-box fractions. */
const LABEL_OFFSET_Y = 0.02;

function quadrantOf(fantasyPull: number, actualPleasure: number): FantasyQuadrant {
  const highFantasy = fantasyPull >= MID;
  const highPleasure = actualPleasure >= MID;
  if (highFantasy) return highPleasure ? "lean" : "keep";
  return highPleasure ? "hidden" : "not";
}

/** 1–10 → 0.1..1.0 across the plot box, exactly as the Figma footer specifies. */
function scale(value: number): number {
  return Math.min(10, Math.max(1, value)) / 10;
}

interface Candidate extends FantasyMapDot {
  /** Distance from the neutral centre — how characteristic the practice is. */
  weight: number;
}

/**
 * The archetype's 16 most characteristic practices, spread across the quadrants
 * (up to 4 each), with the 2 most extreme per quadrant labelled — satisfying the
 * "one per quadrant minimum, 8 labels" rule. Returns null for an unknown
 * archetype so the caller can fall back to the universal illustrative layout.
 */
export function getFantasyMapDots(archetype: string): FantasyMapDot[] | null {
  const content = reportPracticeTendencies[archetype];
  if (!content) return null;

  const byQuadrant = new Map<FantasyQuadrant, Candidate[]>();
  for (const group of content.groups) {
    for (const row of group.rows) {
      const q = quadrantOf(row.fantasyPull, row.actualPleasure);
      const candidate: Candidate = {
        label: row.practice,
        q,
        x: scale(row.actualPleasure),
        y: 1 - scale(row.fantasyPull),
        weight: Math.hypot(row.actualPleasure - MID, row.fantasyPull - MID),
      };
      const bucket = byQuadrant.get(q);
      if (bucket) bucket.push(candidate);
      else byQuadrant.set(q, [candidate]);
    }
  }

  // Most characteristic first; practice name breaks ties so the map is stable
  // across builds (the same reader must not see the dots move).
  for (const bucket of byQuadrant.values()) {
    bucket.sort((a, b) => b.weight - a.weight || (a.label! < b.label! ? -1 : 1));
  }

  // Many practices share an identical score pair, which would stack dots (and
  // their labels) on the exact same pixel. Take at most one candidate per
  // position so all 16 dots are visible and distinct.
  const taken = new Set<string>();
  const key = (c: Candidate) => `${c.x.toFixed(4)}:${c.y.toFixed(4)}`;
  const distinct = (bucket: Candidate[]) =>
    bucket.filter((c) => {
      const k = key(c);
      if (taken.has(k)) return false;
      taken.add(k);
      return true;
    });

  const perQuadrant = new Map<FantasyQuadrant, Candidate[]>();
  for (const [q, bucket] of byQuadrant) perQuadrant.set(q, distinct(bucket));

  /*
   * Labels sit centred BELOW their dot (the chartnote promises that), so they are
   * chosen FIRST, out of the whole 89-practice pool rather than out of an
   * already-narrowed 16. Picking the most extreme dots first and labelling them
   * afterwards cannot work: the most extreme practices cluster in the corners, so
   * eight ~34%-wide labels have nowhere to go and end up overlapping. Choosing
   * for separation up front leaves the anonymous dots to fill in around them.
   */
  const labelled = new Set<Candidate>();
  const placed: Candidate[] = [];
  const place = (c: Candidate) => {
    labelled.add(c);
    placed.push(c);
  };
  /** Distance to the nearer side — a label needs room for HALF its own width. */
  const clearance = (c: Candidate) => Math.min(c.x, 1 - c.x);
  /*
   * Each quadrant prints its name in its own top-left corner ("KEEP IN
   * IMAGINATION", "LEAN IN", …). A label sitting under a dot up there collides
   * with that title, so those corners are off-limits for labels — Figma never
   * overlaps them either. The dot itself still draws; only its label moves.
   */
  const underQuadrantTitle = (c: Candidate) => {
    // The LABEL's box, not the dot's — the label hangs below the dot, so a dot
    // sitting just above a title still drops its text straight onto it.
    const left = c.x - LABEL_W / 2;
    const right = c.x + LABEL_W / 2;
    const top = c.y + LABEL_OFFSET_Y;
    const bottom = top + LABEL_H;
    return [
      [0, 0],
      [0.5, 0],
      [0, 0.5],
      [0.5, 0.5],
    ].some(
      ([qx, qy]) => left < qx! + TITLE_W && qx! < right && top < qy! + TITLE_H && qy! < bottom
    );
  };
  /**
   * Separation, measured in "label boxes". A label is capped at 32% of the plot
   * box and wraps to about two lines, which on the narrowest (mobile) map is
   * ~0.34 of the width and ~0.10 of the height — so two labels clear each other
   * when this returns >= 1. Normalising to these units lets one comparison cover
   * both viewports instead of tuning per breakpoint.
   */
  const separation = (c: Candidate) =>
    placed.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(
          ...placed.map((p) =>
            Math.max(Math.abs(p.x - c.x) / LABEL_W, Math.abs(p.y - c.y) / LABEL_H)
          )
        );
  /** Roomiest dots first, then most characteristic. */
  const byRoom = (a: Candidate, b: Candidate) =>
    clearance(b) - clearance(a) || b.weight - a.weight || (a.label! < b.label! ? -1 : 1);

  // Pass 1 — up to two labels per quadrant: most characteristic first, but only
  // where the dot has side room and clears every label already placed.
  const quadrants = [...perQuadrant.keys()];
  for (const q of quadrants) {
    let taken = 0;
    for (const c of perQuadrant.get(q)!) {
      if (taken >= LABELS_PER_QUADRANT || labelled.size >= TOTAL_LABELS) break;
      if (clearance(c) >= SIDE_CLEARANCE && !underQuadrantTitle(c) && separation(c) >= 1) {
        place(c);
        taken += 1;
      }
    }
    /*
     * One-per-quadrant minimum — but only with a dot that clears the labels
     * already placed. An unchecked fallback here was the last source of
     * overlapping labels: it could drop a label straight onto a neighbour. When
     * a whole quadrant collides, that quadrant simply goes unlabelled; two
     * legible labels beat three with one pair unreadable.
     */
    if (taken === 0) {
      const fallback = [...perQuadrant.get(q)!]
        .sort(byRoom)
        .find((c) => !underQuadrantTitle(c) && separation(c) >= 1);
      if (fallback) place(fallback);
    }
  }

  // Pass 2 — top up to 8 from anywhere in the pool, still requiring real
  // separation. With 89 candidates this succeeds; if a map is genuinely too
  // crowded we ship fewer labels rather than overlapping ones.
  // Side clearance relaxes in stages (the CSS caps label width, so a shorter
  // label near an edge still fits); the no-overlap rule never relaxes.
  for (const minClearance of [SIDE_CLEARANCE, 0.12, 0.08]) {
    if (labelled.size >= TOTAL_LABELS) break;
    const pool = quadrants
      .flatMap((q) => perQuadrant.get(q)!)
      .filter((c) => !labelled.has(c) && clearance(c) >= minClearance && !underQuadrantTitle(c))
      .sort((a, b) => b.weight - a.weight || (a.label! < b.label! ? -1 : 1));
    for (const c of pool) {
      if (labelled.size >= TOTAL_LABELS) break;
      if (separation(c) >= 1) place(c);
    }
  }

  // Anonymous context dots: the most characteristic remaining practices, capped
  // per quadrant so the pack still reads as spread across the map.
  const anonymous: Candidate[] = [];
  const perQuadrantAnon = new Map<FantasyQuadrant, number>();
  for (const c of quadrants
    .flatMap((q) => perQuadrant.get(q)!)
    .filter((c) => !labelled.has(c))
    .sort((a, b) => b.weight - a.weight || (a.label! < b.label! ? -1 : 1))) {
    if (labelled.size + anonymous.length >= TOTAL_DOTS) break;
    const used = perQuadrantAnon.get(c.q) ?? 0;
    if (used >= PER_QUADRANT) continue;
    perQuadrantAnon.set(c.q, used + 1);
    anonymous.push(c);
  }

  // A thin quadrant can leave us short of 16 — top up ignoring the cap.
  if (labelled.size + anonymous.length < TOTAL_DOTS) {
    for (const c of quadrants
      .flatMap((q) => perQuadrant.get(q)!)
      .filter((c) => !labelled.has(c) && !anonymous.includes(c))
      .sort((a, b) => b.weight - a.weight || (a.label! < b.label! ? -1 : 1))) {
      if (labelled.size + anonymous.length >= TOTAL_DOTS) break;
      anonymous.push(c);
    }
  }

  const dots = [...placed, ...anonymous].slice(0, TOTAL_DOTS);

  return dots.map((dot) => ({
    label: labelled.has(dot) ? dot.label : null,
    q: dot.q,
    x: Number(dot.x.toFixed(4)),
    y: Number(dot.y.toFixed(4)),
  }));
}
