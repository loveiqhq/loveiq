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

/** The slots this block reads, present on every section's copy interface. */
export interface LearnPillCopy {
  "learn.eyebrow"?: string | null;
  /**
   * The chapter's own one-sentence definition of the dimension, where the source
   * document opens with one. Renders as the first sentence of the same paragraph
   * as `learn.body`, which is what "add it as the first sentence" asked for.
   */
  "learn.lead"?: string | null;
  "learn.body"?: string | null;
  /**
   * Second intro paragraph. Added by the document pass; absent for every
   * archetype and section the pass did not cover, in which case the block
   * renders exactly as it did before.
   */
  "learn.body.p2"?: string | null;
  /**
   * What a `learn.lead` ending in a colon introduces — the Power chapter's four
   * questions. A list, because four questions run together in a paragraph read
   * as one long sentence.
   */
  "learn.questions"?: string[] | null;
}

interface Props {
  /** BEM prefix, e.g. `growth` for `report-growth__learn-pill`. */
  prefix: string;
  copy: LearnPillCopy;
}

const LearnPill: FC<Props> = ({ prefix, copy }) => {
  const lead = copy["learn.lead"];
  const p1 = copy["learn.body"];
  const p2 = copy["learn.body.p2"];
  const questions = copy["learn.questions"];
  const hasQuestions = !!lead && !!questions && questions.length > 0;
  if (!p1 && !lead) return null;

  return (
    /* Every element carries a SHARED class as well as its per-section one. The
       per-section classes are still what the eighteen existing rule sets target, so
       nothing about their look changes; the shared classes exist so a prefix with no
       rules of its own is styled rather than unstyled. Three new pills (importance,
       stage, constellation) shipped with no CSS at all on 2026-08-26 and rendered the
       raw SVG at its natural size, several hundred pixels tall. This is the fix. */
    <div className={`report-learn-pill-wrap report-${prefix}__learn-pill-wrap`}>
      <span className={`report-learn-pill report-${prefix}__learn-pill`}>
        <span
          className={`report-learn-pill-icon report-${prefix}__learn-pill-icon`}
          aria-hidden="true"
        >
          <BookIcon />
        </span>
        {copy["learn.eyebrow"] ?? "What you will learn"}
      </span>
      {/* The lead is the chapter's own definition and normally opens the same
          paragraph as the green passage. The exception is a lead that ends on a
          colon (Power): what the colon introduces has to come next, so the lead
          takes its own paragraph, the questions follow, and the green passage
          comes after them. Otherwise the colon would introduce the wrong text. */}
      {hasQuestions ? (
        <>
          <p className={`report-learn-body report-${prefix}__learn-body`}>
            <span className="report-learn-lead">{lead}</span>
          </p>
          <ul className="report-learn-questions">
            {questions!.map((q, i) => (
              <li key={i} className="report-learn-question">
                {q}
              </li>
            ))}
          </ul>
          {p1 ? (
            <p className={`report-learn-body report-${prefix}__learn-body report-learn-body-p2`}>
              {p1}
            </p>
          ) : null}
        </>
      ) : (
        <p className={`report-learn-body report-${prefix}__learn-body`}>
          {lead ? <span className="report-learn-lead">{lead}</span> : null}
          {lead && p1 ? " " : null}
          {p1}
        </p>
      )}
      {p2 ? (
        <p className={`report-learn-body report-${prefix}__learn-body report-learn-body-p2`}>
          {p2}
        </p>
      ) : null}
    </div>
  );
};

export default LearnPill;
