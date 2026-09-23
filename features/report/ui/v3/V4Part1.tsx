import type { FC } from "react";
import {
  REPORT_V4_INTRODUCTION,
  REPORT_V4_PARTS,
  REPORT_V4_WHAT_SHAPED,
} from "@/data/report3-archetype-page";
import V3Methodology from "./V3Methodology";
import V4Chapter from "./V4Chapter";
import V4PartHeading from "./V4PartHeading";
import V4Runs from "./V4Runs";

/**
 * Part I — Welcome. Figma 1:168, 393x1723.
 *
 * Order and node ids: heading 1:169 · "Introduction" 1:175 · "What shaped this
 * report" 1:185 · the science section 1:195 · closing paragraph 1:479 · separator
 * 1:481.
 *
 * Both chapters open by default, which is how the frame draws them.
 *
 * KNOWN DELTA, for the review: 1:195 composes Carousel (393x320) + Cards (393x200)
 * + a paragraph, and runs 520 tall. `V3Methodology` is the nearest existing
 * component — its `.rv3-sci__track` deck IS this carousel, with the same seven
 * fields and chapter lists — but it was built to the 729-tall Parts III–VI variant
 * (1:905), so it also carries a "WHERE THIS COMES FROM" eyebrow and headings that
 * 1:195 does not. Rendered as-is here so the difference is visible side by side
 * rather than guessed at.
 */

const V4Part1: FC = () => (
  <section className="rv4-partblock" data-node-id="1:168" data-name="Part 1 - Welcome">
    <V4PartHeading heading={REPORT_V4_PARTS[0]!} lead />

    {/* 1:175 — nothing in Part I collapses, so no toggle. */}
    <V4Chapter title="Introduction" collapsible={false}>
      <div className="rv4-copy">
        {REPORT_V4_INTRODUCTION.map((runs, i) => (
          <p className="rv3-prose" key={i}>
            <V4Runs runs={runs} />
          </p>
        ))}
      </div>
    </V4Chapter>

    {/* 1:185 */}
    <V4Chapter title="What shaped this report" collapsible={false}>
      <p className="rv3-prose">
        <V4Runs runs={REPORT_V4_WHAT_SHAPED} />
      </p>
    </V4Chapter>

    {/* 1:195 — the card deck, source cards and closing paragraph. `chrome="deck"`
     * drops this component's own heading and intro, which V4 promotes into the
     * chapter above (1:185), and emits the closing paragraph (1:479/1:480) plain.
     * The 16px gutter is required: `.rv3-sci__track` uses `margin: 0 -16px` to
     * break back out to the full 393 bleed. */}
    <div className="rv4-col">
      <V3Methodology chrome="deck" />
    </div>

    {/* 1:481 */}
    <div className="rv4-sep" aria-hidden="true" />
  </section>
);

export default V4Part1;
