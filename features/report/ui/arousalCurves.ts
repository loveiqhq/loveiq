// Arousal-family geometry + copy, shared by every surface that draws it.
//
// Designer's note, repeated on all three variant frames:
//   "Reusable: one card, three arousal families. Only the family word, the body
//    line and the arc change — and they must change together in the Snapshot
//    card, the Insight Map teaser and the Arousal Style section."
//
// So this module is the ONE place those three things live. Previously both the
// Snapshot card and the Insight Map teaser hardcoded the `responsive` arc
// ("universal in the frame"), which meant a Spark Seeker read "Your desire is
// spontaneous" above a responsive warm-up curve.
//
// Family assignment comes from `families.arousal` in
// `data/report2-archetype-config.json`, and matches the "SHOWN FOR" lists on the
// Figma frames exactly:
//   responsive  (6/14) Spiritual Lover · Sensual Connector · Relational Nurturer
//                      · Tender Devotee · Quiet Withdrawer · Minimalist Companion
//   spontaneous (3/14) Spark Seeker · Radiant Performer · Explorer of Edges
//   contextual  (5/14) Curious Apprentice · Analytical Sexualist
//                      · Authority Conductor · Emotional Voyeur · Loyal Ritualist
//
// EVERY path, colour, dot position and viewBox below is verbatim from the Figma
// vector exports — nothing here is eyeballed:
//   teaser     responsive 8762:15913 · spontaneous 9116:580 · contextual 9116:601
//   snapshot   responsive 8719:8914  · spontaneous 9116:535 · contextual 9116:562
//
// `ArousalSection` keeps its own 835×321 `ARC_SHAPES` (a different drawing — the
// three-panel stall/recovery diagram) but is keyed off the same family value, so
// all three surfaces agree by construction.

export type ArousalFamily = "responsive" | "spontaneous" | "contextual";

export const AROUSAL_FAMILIES: readonly ArousalFamily[] = [
  "responsive",
  "spontaneous",
  "contextual",
];

/** Narrow an unknown config value to a family, defaulting to the Figma base. */
export function resolveArousalFamily(raw: unknown): ArousalFamily {
  return typeof raw === "string" && (AROUSAL_FAMILIES as readonly string[]).includes(raw)
    ? (raw as ArousalFamily)
    : "responsive";
}

interface Arc {
  /** viewBox height; width is constant per surface. */
  vbHeight: number;
  path: string;
  /** Marker centre, in the same viewBox units. */
  dot: { x: number; y: number };
}

export interface ArousalCurve {
  /** Stroke gradient stops. */
  from: string;
  to: string;
  /** Marker fill. */
  dotColor: string;
  /** Insight Map featured tile — viewBox width 907.285, stroke 4.05034. */
  teaser: Arc;
  /** Snapshot card 2 — viewBox width 114.5, stroke 2.5. */
  snapshot: Arc;
  /** Teaser headline. Fallback when server copy has none for this archetype. */
  headline: string;
  /** Teaser subline. Fallback when server copy has none. */
  subline: string;
  /** Snapshot card 2 body line — per FAMILY, not per archetype. */
  snapshotSubtext: string;
}

/** Shared viewBox widths + stroke weights (identical across families). */
export const TEASER_VB_WIDTH = 907.285;
export const TEASER_STROKE = 4.05034;
export const TEASER_DOT_R = 7.2906;
export const SNAPSHOT_VB_WIDTH = 114.5;
export const SNAPSHOT_STROKE = 2.5;
export const SNAPSHOT_DOT_R = 4;

export const AROUSAL_CURVES: Record<ArousalFamily, ArousalCurve> = {
  // Warms up: one long, steady climb. Purple → orange, marker mid-curve.
  responsive: {
    from: "#9D8AD7",
    to: "#FE6839",
    dotColor: "#9D8AD7",
    teaser: {
      vbHeight: 210.618,
      path: "M0.00390625 168.494C210.621 168.494 291.628 162.014 437.44 132.851C583.253 103.689 696.662 55.0848 907.28 29.1626",
      dot: { x: 437.441, y: 132.851 },
    },
    snapshot: {
      vbHeight: 33.5,
      path: "M1.25 32.2503C37.25 32.2503 55.25 28.2503 73.25 18.2503C91.25 8.2503 105.25 3.2503 113.25 1.2503",
      dot: { x: 73.25, y: 18.25 },
    },
    headline: "Your desire is responsive, not spontaneous",
    subline: "it doesn't switch on — it warms up; the conditions are the ignition",
    snapshotSubtext:
      "Desire that warms up rather than switching on, so the conditions are your ignition.",
  },

  // Ignites early, fades unprompted, partially rekindles. Orange, marker ON the
  // early peak — that spike is the whole point of the shape.
  spontaneous: {
    from: "#FDBA74",
    to: "#EA580C",
    dotColor: "#EA580C",
    teaser: {
      vbHeight: 210.618,
      path: "M0.00390625 144.543C27.2222 144.543 45.3677 29.1626 90.7315 29.1626C136.095 29.1626 154.241 131.864 217.75 135.668C344.769 143.275 453.642 140.739 562.515 131.864C635.097 125.524 680.461 64.6643 753.043 62.1285C825.625 59.5926 870.989 87.4868 907.28 93.8264",
      dot: { x: 90.9332, y: 29.7348 },
    },
    snapshot: {
      vbHeight: 30.71,
      path: "M1.25 29.46C4.61 29.46 6.85 1.25 12.45 1.25C18.05 1.25 20.29 26.36 28.13 27.29C43.81 29.15 57.25 28.53 70.69 26.36C79.65 24.81 85.25 9.93 94.21 9.31C103.17 8.69 108.77 15.51 113.25 17.06",
      dot: { x: 12.45, y: 2.49 },
    },
    headline: "Your desire is spontaneous",
    subline: "it doesn't need warming up — it ignites; the work is keeping it lit, not starting it",
    snapshotSubtext:
      "Desire that ignites on its own, so the work is keeping it lit rather than starting it.",
  },

  // Flat while the conditions are unmet, lifts once they arrive. Teal, marker on
  // the late rise.
  contextual: {
    from: "#81D2C7",
    to: "#0D9488",
    dotColor: "#0D9488",
    teaser: {
      vbHeight: 210.618,
      path: "M0.00390625 113.932C90.7315 113.932 145.168 111.758 208.677 81.3284C263.114 53.0719 317.55 46.5512 417.351 46.5512C480.86 46.5512 508.078 94.3698 571.588 96.5434C635.097 98.7169 698.606 92.1962 753.043 68.2869C816.552 44.3776 861.916 31.3362 907.28 29.1626",
      dot: { x: 746.933, y: 71.7348 },
    },
    snapshot: {
      vbHeight: 26.6801,
      path: "M1.25 25.4301C12.45 25.4301 19.17 24.8101 27.01 16.1301C33.73 8.07011 40.45 6.21011 52.77 6.21011C60.61 6.21011 63.97 19.8501 71.81 20.4701C79.65 21.0901 87.49 19.2301 94.21 12.4101C102.05 5.59011 107.65 1.87011 113.25 1.25011",
      dot: { x: 94.6, y: 12.96 },
    },
    headline: "Your desire is contextual",
    subline: "the setting is the switch — build the context and desire follows",
    snapshotSubtext:
      "Desire that opens when the setting is right, so context is the switch rather than mood.",
  },
};
