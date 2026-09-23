import type { FC, ReactNode } from "react";
import {
  REPORT_V4_TOP_THREE,
  REPORT_V4_TOP_THREE_HEADING,
  REPORT_V4_TOP_THREE_LEDE,
} from "@/data/report3-archetype-page";
import V3TopThree from "./V3TopThree";
import V4Rating from "./V4Rating";
import V4Runs from "./V4Runs";

/**
 * "3 highest scoring Archetypes" — Report V4, Figma 1:493, 361x756.
 *
 * `V3TopThree` already renders the ranked list itself (1:497, 361x505) and needs no
 * change — measured at 497 against the frame's 505. What it does NOT render is the
 * section around it: the heading (1:494), the two-paragraph lede (1:496) and the
 * rating (1:560). Those live here rather than inside V3TopThree, so the component
 * the live `?v3=1` report uses is left exactly as it is.
 */

interface Props {
  /**
   * The reader's archetype percentages. Defaults to the frame's own 43.4 / 39.5 /
   * 36.2, which is what the standalone preview shows.
   */
  percentages?: Record<string, number>;
  /**
   * Replaces the rating row. The live report passes its own "Does this resonate?"
   * widget, which posts to /api/report-feedback; `V4Rating` only records locally.
   */
  feedback?: ReactNode;
}

const V4TopThreeSection: FC<Props> = ({ percentages = REPORT_V4_TOP_THREE, feedback }) => (
  <section
    className="rv4-top3"
    data-node-id="1:493"
    data-name="Section - 3 highest Scoring Archetypes"
  >
    <h2 className="rv4-top3__heading" data-node-id="1:494">
      {REPORT_V4_TOP_THREE_HEADING}
    </h2>
    <div className="rv4-top3__lede" data-node-id="1:496">
      {REPORT_V4_TOP_THREE_LEDE.map((runs, i) => (
        <p key={i}>
          <V4Runs runs={runs} />
        </p>
      ))}
    </div>

    <V3TopThree percentages={percentages} />

    {/* 1:560 — a live widget takes the rating's geometry: right-aligned row, then
     * the frame's 44px tail. */}
    {feedback ? (
      <div className="rv4-rating">
        <div className="rv4-rating__live">{feedback}</div>
        <div className="rv4-rating__tail" aria-hidden="true" />
      </div>
    ) : (
      <V4Rating label={REPORT_V4_TOP_THREE_HEADING} width={361} />
    )}
  </section>
);

export default V4TopThreeSection;
