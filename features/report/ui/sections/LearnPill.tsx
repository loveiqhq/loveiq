import type { FC } from "react";

import BookIcon from "./BookIcon";

/**
 * The labelled pill + intro block that sits above a chapter's card.
 *
 * Eighteen sections rendered this block inline, character for character
 * identical apart from the BEM prefix on each of its four classes. It is one
 * component now because the document pass on 2026-08-26 gave the block a SECOND
 * paragraph (`learn.body.p2`, see `data/report2-key-concepts.ts`), and adding an
 * optional paragraph in eighteen places is eighteen chances to render it
 * slightly differently.
 *
 * The class names are unchanged and still per-section: `app/globals.css` carries
 * per-section rules for `report-<prefix>__learn-pill` and friends — thirteen
 * sections set their own padding on the peek below, and the same is true here —
 * so the prefix is passed in rather than replaced with one shared class.
 *
 * The eyebrow default stays "What you will learn" for the case where no copy
 * layer resolves; the live label comes from `learn.eyebrow`, which
 * `app/api/report/route.ts` now fills from `KEY_CONCEPTS_EYEBROW`.
 */

/** The three slots this block reads, present on every section's copy interface. */
export interface LearnPillCopy {
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  /**
   * Second intro paragraph. Added by the document pass; absent for every
   * archetype and section the pass did not cover, in which case the block
   * renders exactly as it did before.
   */
  "learn.body.p2"?: string | null;
}

interface Props {
  /** BEM prefix, e.g. `growth` for `report-growth__learn-pill`. */
  prefix: string;
  copy: LearnPillCopy;
}

const LearnPill: FC<Props> = ({ prefix, copy }) => {
  const p1 = copy["learn.body"];
  const p2 = copy["learn.body.p2"];
  if (!p1) return null;

  return (
    <div className={`report-${prefix}__learn-pill-wrap`}>
      <span className={`report-${prefix}__learn-pill`}>
        <span className={`report-${prefix}__learn-pill-icon`} aria-hidden="true">
          <BookIcon />
        </span>
        {copy["learn.eyebrow"] ?? "What you will learn"}
      </span>
      <p className={`report-${prefix}__learn-body`}>{p1}</p>
      {p2 ? <p className={`report-${prefix}__learn-body report-learn-body-p2`}>{p2}</p> : null}
    </div>
  );
};

export default LearnPill;
