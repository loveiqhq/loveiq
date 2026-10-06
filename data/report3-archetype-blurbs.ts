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
 * fourteen, from Sanjin's Google Doc "Archetype_Descriptions_Constellations"
 * (1fZDo_fH…, 2026-09-25), which Mark pointed to when he put them in the frame
 * (1941922555). Word for word as the doc; Emotional Voyeur follows the doc rather
 * than the earlier draft still standing in 1:553. Free copy: an archetype's general
 * description, the same for every reader. `?v3=1` keeps the three one-liners above.
 */
export const report4ArchetypeBlurbs: Readonly<Record<string, string>> = {
  "Sensual Connector":
    "Closeness, trust, and slow, attentive touch make sex feel most satisfying. Desire grows from feeling safe and connected, and tends to fade when sex feels rushed or distant.",
  "Spark Seeker":
    "Sex comes alive through play, tension, and novelty. Flirting, pursuit, and surprise build desire, while routine or predictability can quickly dull it.",
  "Relational Nurturer":
    "Sex feels most fulfilling when care, warmth, and pleasure go both ways. Desire grows through giving and receiving attentive care, and fades when they feel taken for granted.",
  "Radiant Performer":
    "Feeling seen, desired, and admired is central to satisfying sex. Attention, praise, and visible enthusiasm build desire, while indifference or disengagement can quickly diminish it.",
  "Explorer of Edges":
    "Intensity, exploration, and experiences a little outside the ordinary are where sex feels most exciting. Desire builds through novelty, power, and pushing boundaries, and fades when sex feels tame or repetitive.",
  "Curious Apprentice":
    "Curiosity, openness, and room to learn make sex feel most rewarding. Guidance and exploration strengthen desire, while judgment or pressure to already know can shut it down.",
  "Spiritual Lover":
    "Sex feels most meaningful when it carries emotional depth and significance. Presence, vulnerability, and mindful touch deepen desire, while mechanical or disconnected sex tends to weaken it.",
  "Minimalist Companion":
    "Simple, calm, pressure-free sex feels most natural. Desire emerges through comfort and gentle closeness, and retreats when sex begins to feel demanding or overly intense.",
  "Emotional Voyeur":
    "Anticipation, fantasy, and room to observe are at the heart of what makes sex compelling. Watching and imagining build desire, while having attention turned too directly onto them can make it fade.",
  "Authority Conductor":
    "Clear structure and defined power dynamics make sex feel most satisfying. Desire strengthens through leading and directing, and weakens when the dynamic feels chaotic or out of their hands.",
  "Loyal Ritualist":
    "Familiarity, stability, and a trusted rhythm create the conditions where sex feels best. Consistency and shared rituals support desire, while sudden or pressured change can disrupt it.",
  "Tender Devotee":
    "Feeling wanted, reassured, and appreciated makes sex feel deeply satisfying. Praise and affection nourish desire, while judgment or rejection can quickly diminish it.",
  "Analytical Sexualist":
    "Sex is most satisfying when there is space to understand what works and improve it together. Feedback and experimentation build desire, while confusion or difficulty reading what is happening can dampen it.",
  "Quiet Withdrawer":
    "Patience, gentleness, and freedom from pressure create the conditions where sex feels best. Safety and quiet closeness allow desire to emerge, while feeling pushed or overwhelmed makes it recede.",
};

/** Archetypes still waiting on a V3 one-liner. Asserted by a test so the gap
 * closes loudly rather than silently shipping blank rows. */
export function missingReport3Blurbs(allArchetypes: readonly string[]): string[] {
  return allArchetypes.filter((name) => !report3ArchetypeBlurbs[name]);
}
