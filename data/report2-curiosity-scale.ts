/**
 * All fourteen archetypes plotted on the curiosity scale.
 *
 * Chapter 16 of the source document carries a "Common Curiosity Level Styles
 * Across Archetypes" list — six named styles, each with an "(e.g. …)" line
 * naming the archetypes it covers. Mark asked on 2026-08-26 for that block to be
 * shown the way Importance of Sexuality and Confidence Level are shown: every
 * archetype on one scale, with the reader's own dot named.
 *
 * WHERE THE POSITIONS COME FROM. Importance of Sexuality's fourteen positions
 * were extracted from a Figma node — a designer ranked them. There is no such
 * artefact for curiosity, so this ranking was built the way that one was: from
 * what each archetype's own chapter says. Two sources, in this order:
 *
 *   1. The document's six styles and their "(e.g. …)" lists, which name
 *      THIRTEEN of the fourteen. Those lists set which BAND an archetype is in.
 *      The document's names are pre-V9 — "Exhibitionist Performer", "Approval
 *      Seeker", "Power Orchestrator" — and are translated through the repo's own
 *      rename map (`features/report/server/archetypeSlug.ts`, ADR 0002).
 *   2. Each archetype's `curiosity.body.p1` and `curiosity.takeaway` in the copy
 *      matrix, which set the position WITHIN its band. Every one of them names a
 *      condition ("Depth-first", "Safety-first", "Novelty-first", …), and the
 *      ordering inside a band follows how far that condition lets exploration
 *      travel once it is met.
 *
 * `reason` on each row is the sentence that put it there, so the next person can
 * argue with the placement instead of guessing at it.
 *
 * THE ONE INFERENCE. **Emotional Voyeur appears in none of the document's six
 * lists.** It is placed from its copy alone and flagged `inferred: true`.
 *
 * WHY THE AXIS IS NOT "HOW MUCH CURIOSITY". Eight of the fourteen takeaways
 * explicitly refuse that reading — "Your curiosity isn't low", "isn't restless",
 * "turns inward, not outward", "goes deep rather than wide", "chases
 * understanding, not novelty". A scale labelled low→high curiosity would call
 * eight archetypes something their own chapter denies on the same screen. So the
 * axis is how far exploration REACHES: deepening what is already there at the
 * left, reaching for what is new at the right. The document's four level bands
 * still sit along it in order, which is what makes it the same scale.
 */

export interface CuriosityScaleEntry {
  name: string;
  /** Normalized position, 0 (deepens the familiar) → 1 (reaches for the new). */
  x: number;
  /** Which of the document's level bands the archetype's own list puts it in. */
  band: "low" | "moderate" | "high" | "very-high";
  /** The evidence for this position. */
  reason: string;
  /** True when the document names no band for it and the copy alone placed it. */
  inferred?: boolean;
}

/** Band edges on the axis, used to draw the four labelled zones under it. */
export const CURIOSITY_BANDS: {
  band: CuriosityScaleEntry["band"];
  label: string;
  from: number;
  to: number;
}[] = [
  { band: "low", label: "Low", from: 0, to: 0.22 },
  { band: "moderate", label: "Moderate", from: 0.22, to: 0.5 },
  { band: "high", label: "High", from: 0.5, to: 0.78 },
  { band: "very-high", label: "Very high", from: 0.78, to: 1 },
];

/**
 * What the dots are.
 *
 * The Importance of Sexuality strip carries a line explaining that each dot is one
 * of the fourteen archetypes; this scale shipped without one on 2026-08-26 and a
 * reader skimming it saw fourteen unexplained dots. Same job, same voice.
 */
export const CURIOSITY_SCALE_NOTE =
  "Each dot is one of the 14 archetypes, placed by how far its members tend to take exploration. Yours is named.";

/** Axis end labels. */
export const CURIOSITY_AXIS = {
  left: "deepens what's familiar",
  right: "reaches for the new",
} as const;

export const CURIOSITY_SCALE: CuriosityScaleEntry[] = [
  {
    name: "Quiet Withdrawer",
    x: 0.07,
    band: "low",
    reason:
      "Calm-first: “the moment intensity rises, exploring stops”, and it explores “inward and slow, one gentle change at a time”.",
  },
  {
    name: "Minimalist Companion",
    x: 0.15,
    band: "low",
    reason:
      "Comfort-first: exploration “turns threatening the moment it adds intensity, complexity, or expectation”.",
  },
  {
    name: "Emotional Voyeur",
    x: 0.29,
    band: "moderate",
    inferred: true,
    reason:
      "Named in none of the document's six lists. Privacy-first, and its takeaway says curiosity “turns inward, not outward” and “lives in imagination and atmosphere” — real reach, gated on not being seen.",
  },
  {
    name: "Tender Devotee",
    x: 0.34,
    band: "moderate",
    reason:
      "Document: Moderate (as “Approval Seeker”). Opens “when exploring earns a warm response” and starves at any risk of criticism.",
  },
  {
    name: "Loyal Ritualist",
    x: 0.38,
    band: "moderate",
    reason:
      "Document: Moderate. “Something new only appeals when it deepens what you already have” — deepening rather than widening.",
  },
  {
    name: "Sensual Connector",
    x: 0.44,
    band: "moderate",
    reason:
      "Document: Moderate. Safety-first, but “the clearer the commitment, the further your desire is willing to go” — the top of the band once the condition is met.",
  },
  {
    name: "Authority Conductor",
    x: 0.47,
    band: "moderate",
    reason:
      "Document: Moderate (as “Power Orchestrator”), and the only archetype in the instrumental/strategic style. Structure-first, and “goes deep rather than wide”.",
  },
  {
    name: "Relational Nurturer",
    x: 0.55,
    band: "high",
    reason:
      "Document: High. Care-first — “when care flows both ways, you explore further than anyone expects”.",
  },
  {
    name: "Analytical Sexualist",
    x: 0.62,
    band: "high",
    reason:
      "Document: High, and one of the two learning- and mastery-driven styles. “The clearer things are, the further you'll go”.",
  },
  {
    name: "Spiritual Lover",
    x: 0.68,
    band: "high",
    reason:
      "Document: High. Depth-first — “the more intentional the container, the more freely it flows”.",
  },
  {
    name: "Radiant Performer",
    x: 0.74,
    band: "high",
    reason:
      "Document: High (as “Exhibitionist Performer”). Response-first — “will explore almost anywhere it's met with visible enthusiasm”, so the widest reach in the band.",
  },
  {
    name: "Curious Apprentice",
    x: 0.82,
    band: "very-high",
    reason:
      "Document: Very high / exploration-driven, and also learning- and mastery-driven. Learning-first, so its reach is wide but structured — the bottom of the top band.",
  },
  {
    name: "Explorer of Edges",
    x: 0.92,
    band: "very-high",
    reason:
      "Document: Very high / exploration-driven. Edge-first — “it reaches for the edge”, limited only by shame and judgement.",
  },
  {
    name: "Spark Seeker",
    x: 0.97,
    band: "very-high",
    reason:
      "Document: Very high / exploration-driven, named first in that list. Novelty-first, and its desire “starves in whatever removes choice” — the furthest reach of the fourteen.",
  },
];

/** This archetype's entry, or null for a name that is not one of the fourteen. */
export function getCuriosityScaleEntry(name: string): CuriosityScaleEntry | null {
  return CURIOSITY_SCALE.find((e) => e.name === name) ?? null;
}
