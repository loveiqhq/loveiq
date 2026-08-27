"use client";

import { useState, type FC } from "react";

import VerdictStar from "./VerdictStar";
import BookIcon from "./BookIcon";
import LearnPill, { type LearnPillCopy } from "./LearnPill";
import {
  KNOWHOW_EDU,
  KNOWHOW_EDU_EYEBROW,
  KNOWHOW_LAYERS,
  KNOWHOW_LIBERATING,
  KNOWHOW_MODEL_CLOSE,
  KNOWHOW_NONCONCORDANCE,
  KNOWHOW_VERDICT,
} from "@/data/report2-knowhow";

/**
 * "Arousal, Desire & Pleasure" — chapter 20, back in the report.
 *
 * The chapter was dropped from Report 2.0 (it was listed under "dropped
 * outright" in `RETIRED_REPORT_SECTION_IDS`). Mark asked for it back on
 * 2026-08-26 as its own section, summarised and laid out to match the rest of the
 * report rather than reproduced as the 48-paragraph wall of HTML that still sits
 * in `data/report-general.ts` under this section's `generalContent`.
 *
 * WHY IT LOOKS LIKE THIS. The chapter's own closing move is a three-layer mental
 * model — "The Body (Arousal): fast, automatic, non-moral / The Mind (Desire):
 * intentional, meaning-based, selective / The Experience (Pleasure): subjective,
 * integrative, safety-dependent" — so the three layers ARE the visual, stacked in
 * that order, each holding the one question the chapter says that system answers.
 * Everything else in the chapter is either a lead-in to that model or a
 * consequence of it, which is what the blocks above and below the stack carry.
 *
 * UNIVERSAL + FREE. `isPremium: false` on the section row, no `archetypeBlockId`,
 * and none of the copy varies by archetype — so unlike its neighbours in Part III
 * this section takes no copy prop, no `locked`, and no unlock CTA. Its text lives
 * in `data/report2-knowhow.ts`, verbatim from the document.
 */

interface Props {
  /** Key Concepts for this chapter; null when the layer has none. */
  learn?: LearnPillCopy | null;
}

const KnowHowSection: FC<Props> = ({ learn = null }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="report-knowhow">
      <h3 className="report-knowhow__heading">Arousal, Desire &amp; Pleasure</h3>

      {/* Key Concepts, added 2026-08-27. It holds the chapter's opening two
        paragraphs, which used to open the card. */}
      {learn ? <LearnPill prefix="knowhow" copy={learn} /> : null}

      <article className="report-knowhow__card">
        {/* The three systems, stacked. The layer number is decorative — the labels
          already name the systems — so it is hidden from the reader of a screen
          reader and the list itself carries the order. */}
        <p className="report-knowhow__eyebrow">Three systems, not one</p>
        <ol className="report-knowhow__layers">
          {KNOWHOW_LAYERS.map((layer, i) => (
            <li key={layer.label} className="report-knowhow__layer">
              <span className="report-knowhow__layer-num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="report-knowhow__layer-text">
                <p className="report-knowhow__layer-label">
                  {layer.label}
                  <span className="report-knowhow__layer-descriptor">{layer.descriptor}</span>
                </p>
                <p className="report-knowhow__layer-question">{layer.question}</p>
                <p className="report-knowhow__layer-body">{layer.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="report-knowhow__body">{KNOWHOW_MODEL_CLOSE}</p>

        {/* Non-concordance, named and then settled. The verdict uses the same star
          + rule the per-archetype takeaways use, because it plays the same role:
          the one line the chapter will not qualify. */}
        <div className="report-knowhow__nonconcordance report-purple-block">
          <span className="report-block-label">When they do not align</span>
          <p className="report-purple-block__body">{KNOWHOW_NONCONCORDANCE}</p>
        </div>

        <div className="report-knowhow__verdict report-verdict">
          <VerdictStar />
          <p className="report-knowhow__takeaway">{KNOWHOW_VERDICT}</p>
          <span className="report-verdict-rule" aria-hidden="true" />
        </div>

        {KNOWHOW_LIBERATING.map((para, i) => (
          <p key={i} className="report-knowhow__body">
            {para}
          </p>
        ))}

        {/* "Take out the 'Your body may react...' section" (Mark, 2026-08-27). The
          chapter's Final Reflection is gone from the render; KNOWHOW_FINAL stays in
          the data because it is document text and this is a layout call. */}
        {/* The educational expander, in the shape the other thirteen use. Universal
          copy, so it renders for everyone; see KNOWHOW_EDU for why this chapter's
          hardest idea is the one behind the toggle and the trauma passage is not. */}
        <div className="report-knowhow__edu">
          <button
            type="button"
            className="report-knowhow__edu-summary"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="report-knowhow__edu-icon" aria-hidden="true">
              <BookIcon />
            </span>
            <span className="report-knowhow__edu-eyebrow">{KNOWHOW_EDU_EYEBROW}</span>
            <span
              className={`report-knowhow__edu-chevron${expanded ? " is-open" : ""}`}
              aria-hidden="true"
            >
              ⌄
            </span>
          </button>

          {expanded ? (
            <div className="report-knowhow__edu-body">
              {KNOWHOW_EDU.map((para, i) => (
                <p key={i} className="report-knowhow__edu-para">
                  {para}
                </p>
              ))}
            </div>
          ) : (
            <div className="report-knowhow__edu-peek report-learn-peek">
              <p className="report-knowhow__edu-teaser report-learn-teaser">{KNOWHOW_EDU[0]}</p>
              <button
                type="button"
                className="report-knowhow__edu-cta report-learn-cta"
                onClick={() => setExpanded(true)}
              >
                Read the full explanation
              </button>
            </div>
          )}
        </div>
      </article>
    </div>
  );
};

export default KnowHowSection;
