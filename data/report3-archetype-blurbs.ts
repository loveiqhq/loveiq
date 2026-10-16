/**
 * One-line archetype descriptions for the Report V3 "three strongest patterns"
 * card (Figma 10392:18812).
 *
 * INCOMPLETE BY DESIGN — 3 of 14. These three are transcribed verbatim from the
 * Figma frame, which only demos a Spark Seeker report. No equivalent copy exists
 * anywhere in the repo: `report-archetypes.ts` holds long HTML prose,
 * `archetypePresentation.tagline` holds the first-person motto, and the copy
 * matrix has no short-descriptor slot. The remaining 11 need authoring by Mark
 * before V3 ships — they are deliberately absent rather than invented, and the
 * card omits the line for any archetype missing here.
 *
 * Keyed by the display name used in `reportTheme` / `archetypePresentation`.
 */
export const report3ArchetypeBlurbs: Readonly<Record<string, string>> = {
  "Spark Seeker":
    "Desire that ignites on aliveness and novelty. It arrives fast, fades fast, and relights through play rather than effort.",
  "Explorer of Edges":
    "Desire that wants intensity with permission. The charge opens it in seconds; a flicker of judgement closes it just as fast.",
  "Emotional Voyeur":
    "Desire that begins in imagination and atmosphere. Privacy is what lets it reach the body; being put on the spot empties it out.",
};

/**
 * Report V4's descriptions for "3 Highest Scoring Archetypes" (Figma 1:493) — all
 * fourteen, from Sanjin's Google Doc "Slimmed_Archetype_Descriptions_Constellations"
 * (1ON0pxZ1…, 16.10), word for word. The slimmed report (1665:3553) cut each to one
 * line: every one is the first sentence of the two-sentence description it replaces
 * (25.09, "Archetype_Descriptions_Constellations"). Emotional Voyeur follows the doc
 * rather than the shorter line Mark set in the frame. Free copy: an archetype's
 * general description, the same for every reader. `?v3=1` keeps the three one-liners
 * above.
 */
export const report4ArchetypeBlurbs: Readonly<Record<string, string>> = {
  "Sensual Connector": "Closeness, trust, and slow, attentive touch make sex feel most satisfying.",
  "Spark Seeker": "Sex comes alive through play, tension, and novelty.",
  "Relational Nurturer": "Sex feels most fulfilling when care, warmth, and pleasure go both ways.",
  "Radiant Performer": "Feeling seen, desired, and admired is central to satisfying sex.",
  "Explorer of Edges":
    "Intensity, exploration, and experiences a little outside the ordinary are where sex feels most exciting.",
  "Curious Apprentice": "Curiosity, openness, and room to learn make sex feel most rewarding.",
  "Spiritual Lover": "Sex feels most meaningful when it carries emotional depth and significance.",
  "Minimalist Companion": "Simple, calm, pressure-free sex feels most natural.",
  "Emotional Voyeur":
    "Anticipation, fantasy, and room to observe are at the heart of what makes sex compelling.",
  "Authority Conductor":
    "Clear structure and defined power dynamics make sex feel most satisfying.",
  "Loyal Ritualist":
    "Familiarity, stability, and a trusted rhythm create the conditions where sex feels best.",
  "Tender Devotee": "Feeling wanted, reassured, and appreciated makes sex feel deeply satisfying.",
  "Analytical Sexualist":
    "Sex is most satisfying when there is space to understand what works and improve it together.",
  "Quiet Withdrawer":
    "Patience, gentleness, and freedom from pressure create the conditions where sex feels best.",
};

/** Archetypes still waiting on a V3 one-liner. Asserted by a test so the gap
 * closes loudly rather than silently shipping blank rows. */
export function missingReport3Blurbs(allArchetypes: readonly string[]): string[] {
  return allArchetypes.filter((name) => !report3ArchetypeBlurbs[name]);
}
