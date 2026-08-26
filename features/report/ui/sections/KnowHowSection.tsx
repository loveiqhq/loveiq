"use client";

import type { FC } from "react";

import VerdictStar from "./VerdictStar";
import {
  KNOWHOW_FINAL,
  KNOWHOW_INTRO,
  KNOWHOW_LAYERS,
  KNOWHOW_LIBERATING,
  KNOWHOW_MODEL_CLOSE,
  KNOWHOW_NONCONCORDANCE,
  KNOWHOW_VERDICT,
  KNOWHOW_WHY,
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

const KnowHowSection: FC = () => (
  <div className="report-knowhow">
    <h3 className="report-knowhow__heading">Arousal, Desire &amp; Pleasure</h3>

    <article className="report-knowhow__card">
      <p className="report-knowhow__lead">{KNOWHOW_INTRO}</p>
      <p className="report-knowhow__body">{KNOWHOW_WHY}</p>

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

      <div className="report-knowhow__final">
        {KNOWHOW_FINAL.map((para, i) => (
          <p key={i} className="report-knowhow__final-para">
            {para}
          </p>
        ))}
      </div>
    </article>
  </div>
);

export default KnowHowSection;
