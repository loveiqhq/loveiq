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

/** Archetypes still waiting on a V3 one-liner. Asserted by a test so the gap
 * closes loudly rather than silently shipping blank rows. */
export function missingReport3Blurbs(allArchetypes: readonly string[]): string[] {
  return allArchetypes.filter((name) => !report3ArchetypeBlurbs[name]);
}
