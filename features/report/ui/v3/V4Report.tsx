import type { FC } from "react";
import {
  REPORT_V4_PART4_CHAPTERS,
  REPORT_V4_PART5_CHAPTERS,
  REPORT_V4_PART6_CHAPTERS,
} from "@/data/report3-archetype-page";
import type { Report3CardCopy } from "@/data/report3-archetype-card";
import type { V4LearnMoreByChapter } from "@/data/report3-learn-more";
import type { Report3TypicalBeliefsView } from "@/data/report3-typical-beliefs";
import type { Report3AcceleratorsView } from "@/data/report3-accelerators";
import type { ArchetypeName } from "@features/report/server/archetypeSlug";
import V4ChapterPart from "./V4ChapterPart";
import V4Part1 from "./V4Part1";
import V4Part2 from "./V4Part2";
import V4ReportChrome from "./V4ReportChrome";

/**
 * The whole Report V4 mobile page — Figma 1:165, "Report V4 — MOBILE".
 *
 * One continuous scroll, which is what the frame is: `1:166` is a single 393x12,612
 * container holding all six parts stacked, with the header (1:1279) and chapter pill
 * (1:1272) floating above it. There is nothing tabbed anywhere in the frame; the
 * only navigation it draws is that pill, and it reports position rather than
 * switching views.
 *
 * Parts III–VI share one component; only their chapter lists differ.
 */

interface Props {
  archetype: ArchetypeName;
  matchStrength: number;
  card: Report3CardCopy;
  initialDeckIndex?: number;
  /** Built once at the host by `buildLearnMoreForReader`, keyed by chapter id. */
  learnMore?: V4LearnMoreByChapter;
  /** Opens the paywall from a gated article. */
  onUnlock?: () => void;
  /** Part III's Typical Beliefs chapter body, read on the server. */
  typicalBeliefs?: Report3TypicalBeliefsView | null;
  /** Part IV's Accelerator & Brakes chapter body, read on the server. */
  accelerators?: Report3AcceleratorsView | null;
}

const V4Report: FC<Props> = ({
  archetype,
  matchStrength,
  card,
  initialDeckIndex = 0,
  learnMore,
  onUnlock,
  typicalBeliefs,
  accelerators,
}) => (
  <div className="rv4-report" data-node-id="1:165" data-name="Report V4 - MOBILE">
    <V4ReportChrome />

    {/* 1:166 — the scrolling container. */}
    <div className="rv4-report__flow" data-node-id="1:166">
      <V4Part1 />
      <V4Part2
        archetype={archetype}
        matchStrength={matchStrength}
        card={card}
        initialDeckIndex={initialDeckIndex}
      />
      <V4ChapterPart
        archetype={archetype}
        learnMore={learnMore}
        onUnlock={onUnlock}
        typicalBeliefs={typicalBeliefs}
      />
      <V4ChapterPart
        archetype={archetype}
        partIndex={3}
        chapters={REPORT_V4_PART4_CHAPTERS}
        learnMore={learnMore}
        onUnlock={onUnlock}
        accelerators={accelerators}
      />
      <V4ChapterPart
        archetype={archetype}
        partIndex={4}
        chapters={REPORT_V4_PART5_CHAPTERS}
        learnMore={learnMore}
        onUnlock={onUnlock}
      />
      <V4ChapterPart
        archetype={archetype}
        partIndex={5}
        chapters={REPORT_V4_PART6_CHAPTERS}
        learnMore={learnMore}
        onUnlock={onUnlock}
        trailingSeparator
      />
    </div>
  </div>
);

export default V4Report;
