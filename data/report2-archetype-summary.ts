/**
 * The closing "Summary" chapter.
 *
 * The report used to end on a short editorial block titled "Where this leaves
 * you" (`features/report/ui/sections/ClosingSection.tsx`). Mark asked on
 * 2026-08-26 for that to become "Summary", carrying the WHOLE of chapter 3
 * ("Core Archetype") from the Spark Seeker source document.
 *
 * Verbatim, in document order, one array entry per source paragraph.
 *
 * ONE THING TO FLAG: this text is third person throughout ("The Spark Seeker
 * experiences sexuality primarily as a space for…"). The rest of Report 2.0
 * speaks to the reader in second person, and the pre-2.0 `summary` chapter was
 * retired for exactly this reason — see the note in `RETIRED_REPORT_SECTION_IDS`
 * ("the pre-2.0 THIRD PERSON voice … reads wrong in a report that speaks to the
 * reader throughout"). It is carried as asked, unedited; switching the voice is a
 * copy decision.
 *
 * Only `spark-seeker` is populated. Other archetypes keep the existing closing
 * block, which is what `getArchetypeSummary` returning null preserves.
 */

export const SUMMARY_HEADING = "Summary";

/** slug → the chapter-3 paragraphs, verbatim and in order. */
export const report2ArchetypeSummary: Record<string, string[]> = {
  "spark-seeker": [
    "You score highest on: “Spark Seeker”",
    "The Spark Seeker experiences sexuality primarily as a space for aliveness, chemistry, and playful charge. For them, desire begins in anticipation, energy, and the feeling that something exciting is unfolding. When there is flirtation, novelty, and a sense of “spark,” their erotic system ignites quickly and vividly.",
    "They are lively, charismatic, and pleasure-forward lovers who value teasing, spontaneity, and emotional lightness over heaviness or routine. Sexuality is meaningful to them not as reassurance or devotion, but as a way to feel energized, wanted, and fully awake in the moment. Fun, novelty, and momentum are central to their arousal.",
    "At their best, Spark Seekers create intimacy that feels electric, playful, and creatively alive for both partners. Their presence invites laughter, confidence, and erotic adventure. However, because their desire is closely tied to stimulation and freshness, they may struggle when sex becomes predictable, duty-like, or emotionally dense. In such moments, arousal can drop quickly not because attraction is gone, but because their system stops feeling “charged.”",
    "Spark Seekers may hesitate to slow down or go deeper emotionally, fearing it will dull the spark or trap them in expectations. This can lead to repeated cycles of intensity followed by restlessness, or to disconnect when a partner asks for more consistency than they naturally offer. They may also worry that if they are not exciting, they will lose desirability or feel bored and stuck.",
    "Growth for the Spark Seeker lies in learning to sustain desire beyond novelty, building depth without losing play, communicating needs for variety without shame, and developing the capacity to enjoy calm intimacy without interpreting it as “dead.”",
    "When supported and understood, the Spark Seeker’s sexuality becomes a powerful source of joy, creativity, and lasting erotic vitality that can keep relationships feeling bright over time.",
  ],
};

/** The paragraphs for this archetype, or null when the document has none. */
export function getArchetypeSummary(slug: string): string[] | null {
  return report2ArchetypeSummary[slug] ?? null;
}
