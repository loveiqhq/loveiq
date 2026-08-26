import type { FC } from "react";

import type { Report2DocStyle, Report2StyleMatch } from "@/data/report2-doc-styles";

/**
 * "The pre-defined style your archetype is" — one block, three chapters.
 *
 * The source document carries an "across the archetypes" list in three places:
 * curiosity level (chapter 16, "Common Curiosity Level Styles Across
 * Archetypes"), arousal style (21) and initiation style (22). Report 2.0 dropped
 * all three lists and kept only the per-archetype prose. Mark asked for them
 * back on 2026-08-26 — the reader's own style, name and description, copied and
 * not reinterpreted.
 *
 * So this renders the reader's OWN entry rather than the whole list: the six or
 * eight catalogue entries stay in `data/report2-doc-styles.ts` for the day the
 * design wants the reader placed against all of them.
 *
 * A `secondary` match is labelled as such, because two of the three lists say a
 * person carries more than one ("Most people carry more than one arousal style")
 * and an unlabelled stack of three would read as three equal verdicts.
 */

interface Props {
  /** The block's small-caps label, the document's own heading for the list. */
  eyebrow: string;
  /** Resolved entries — see `resolveStyles`. Empty renders nothing. */
  styles: (Report2DocStyle & Report2StyleMatch)[];
  /** BEM modifier, e.g. `curiosity`, so a chapter can tune its own spacing. */
  modifier: string;
  /** The document's closing line under the list, where it earns its place. */
  outro?: string;
}

const DocStyleBlock: FC<Props> = ({ eyebrow, styles, modifier, outro }) => {
  if (styles.length === 0) return null;

  return (
    <div className={`report-doc-styles report-doc-styles--${modifier}`}>
      <p className="report-doc-styles__eyebrow">{eyebrow}</p>
      <ul className="report-doc-styles__list">
        {styles.map((s) => (
          <li key={s.name} className="report-doc-styles__item">
            <p className="report-doc-styles__name">
              {s.name}
              {s.role === "secondary" ? (
                <span className="report-doc-styles__role"> · also present</span>
              ) : null}
            </p>
            <p className="report-doc-styles__desc">{s.description}</p>
          </li>
        ))}
      </ul>
      {outro ? <p className="report-doc-styles__outro">{outro}</p> : null}
    </div>
  );
};

export default DocStyleBlock;
