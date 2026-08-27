import type { FC } from "react";

import { getReportTheme } from "../reportTheme";

/**
 * A chapter headline with the archetype's name in the archetype's own colour.
 *
 * Mark, 2026-08-27: "For all headlines that have the 'of the Spark Seeker', the
 * 'Spark Seeker' should be in its Archetype colour." The accent comes from
 * `getReportTheme`, the same source the charts use for that archetype's dot and
 * curve, so the headline and the visuals under it agree.
 *
 * Which headings take a suffix at all, and which do not, is `chapterHeading`.
 */

interface Props {
  /** The heading without the archetype, e.g. "Core Insecurities". */
  base: string;
  archetype: string | null | undefined;
  /** The BEM class the section already puts on its `h3`. */
  className: string;
}

const ChapterHeading: FC<Props> = ({ base, archetype, className }) => {
  const { lead, suffix } = chapterHeading(base, archetype);
  return (
    <h3 className={className}>
      {lead}
      {suffix ? (
        <span
          className="report-chapter-heading__archetype"
          style={{ color: getReportTheme(suffix).accent }}
        >
          {suffix}
        </span>
      ) : null}
    </h3>
  );
};

export default ChapterHeading;

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
 *
 * Returns the two halves separately rather than one string, because the archetype
 * name is set in the archetype's own accent colour (Mark, 2026-08-27) and the
 * renderer needs to wrap it. `suffix` is null when nothing is appended.
 */
export function chapterHeading(
  base: string,
  archetype: string | null | undefined
): { lead: string; suffix: string | null } {
  if (!archetype) return { lead: base, suffix: null };
  if (HEADINGS_WITHOUT_ARCHETYPE.has(base)) return { lead: base, suffix: null };
  return { lead: `${base} ${FOR_THE.has(base) ? "for" : "of"} the `, suffix: archetype };
}
