import type { FC } from "react";

import type { Report2DocStyle, Report2StyleMatch } from "@/data/report2-doc-styles";

/**
 * The reader's own style from one of the document's "across the archetypes" lists,
 * set as a verdict: the style's name in large serif on the left, a hairline, its
 * description on the right.
 *
 * Replaces `DocStyleBlock`'s bulleted treatment on 2026-08-27. Mark asked for the
 * curiosity and initiation style blocks to look like the top of the Confidence
 * chapter, so every value here is transcribed from `.report-confidence__result*`:
 * the same 203px / 1px / 1fr grid, the same muted-grey serif at the same clamp,
 * the same hairline, the same body scale, and the same collapse to one column
 * under 768px.
 *
 * THE "(e.g. …)" LISTS ARE DROPPED. The document ends each style's description by
 * naming the archetypes it covers, which is useful when you are reading the whole
 * list and noise when you are being told your own — and two of those lists carry
 * pre-V9 archetype names that no longer exist in the product. Requested
 * 2026-08-27; the full strings are still in `data/report2-doc-styles.ts`.
 *
 * More than one style (the Spark Seeker carries three arousal styles) stacks, with
 * the secondaries at a smaller name size so the primary still reads as the answer.
 */

/** Strip the document's trailing "(e.g. Archetype, Archetype)" from a description. */
export function withoutExamples(description: string): string {
  return description.replace(/\s*\(e\.g\.[^)]*\)\s*$/, "").trim();
}

interface Props {
  /** The block's small-caps label. */
  eyebrow: string;
  styles: (Report2DocStyle & Report2StyleMatch)[];
  /** BEM modifier, so a chapter can tune its own spacing. */
  modifier: string;
  /** The document's closing line under the list, where it earns its place. */
  outro?: string;
}

const StyleVerdict: FC<Props> = ({ eyebrow, styles, modifier, outro }) => {
  if (styles.length === 0) return null;

  return (
    <div className={`report-style-verdict report-style-verdict--${modifier}`}>
      <p className="report-style-verdict__eyebrow">{eyebrow}</p>

      {styles.map((s) => (
        <div
          key={s.name}
          className={`report-style-verdict__row${
            s.role === "secondary" ? " report-style-verdict__row--secondary" : ""
          }`}
        >
          <p className="report-style-verdict__name">{s.name}</p>
          <span className="report-style-verdict__divider" aria-hidden="true" />
          <div className="report-style-verdict__body">
            {s.role === "secondary" ? (
              <span className="report-style-verdict__role">also present</span>
            ) : null}
            <p className="report-style-verdict__desc">{withoutExamples(s.description)}</p>
          </div>
        </div>
      ))}

      {outro ? <p className="report-style-verdict__outro">{outro}</p> : null}
    </div>
  );
};

export default StyleVerdict;
