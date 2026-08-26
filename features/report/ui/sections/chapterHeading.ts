/**
 * "Core Insecurities" → "Core Insecurities of the Spark Seeker".
 *
 * Mark asked on 2026-08-26 for every chapter headline to name the archetype, the
 * way the source document's own subheadings do ("Core Insecurities of the Spark
 * Seeker", "Attachment Style of the Spark Seeker").
 *
 * NOT every heading takes it, and the ones that don't are listed here rather than
 * decided at each call site. Three kinds are excluded:
 *
 *   - **Personal, not archetypal.** "Your snapshot", "Your insight map" and "Five
 *     things this report found" are built from the reader's own answers. "Your
 *     snapshot of the Spark Seeker" would name the wrong owner.
 *   - **Universal.** "Arousal, Desire & Pleasure" is the same chapter for all
 *     fourteen — its own section takes no archetype at all. Attaching a name to it
 *     would claim a personalisation that isn't there.
 *   - **Already naming it, or grammatically closed.** "Core Archetype" is followed
 *     by the archetype's name on the next line, and "You're a constellation, not a
 *     type" is a sentence that cannot take the suffix.
 *
 * `for the` rather than `of the` for Reading Recommendations, because the
 * document's own heading is "Recommendations for the Spark Seeker" and "of the"
 * would read as recommendations belonging to the archetype rather than made for
 * the reader.
 */

/** Headings that stay as they are, and why — see the note above. */
export const HEADINGS_WITHOUT_ARCHETYPE: ReadonlySet<string> = new Set([
  "Your snapshot",
  "Your insight map",
  "Five things this report found",
  "Arousal, Desire & Pleasure",
]);

/** Headings that read better with "for the" than "of the". */
const FOR_THE: ReadonlySet<string> = new Set(["Reading Recommendations"]);

/**
 * The chapter heading with the archetype appended, or unchanged when the heading
 * is on the exclusion list or no archetype is known.
 */
export function chapterHeading(base: string, archetype: string | null | undefined): string {
  if (!archetype) return base;
  if (HEADINGS_WITHOUT_ARCHETYPE.has(base)) return base;
  return `${base} ${FOR_THE.has(base) ? "for" : "of"} the ${archetype}`;
}
