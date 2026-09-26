import type { FC } from "react";
import { REPORT_V4_PARTS, REPORT_V4_SUMMARY } from "@/data/report3-archetype-page";
import type { Report3CardCopy } from "@/data/report3-archetype-card";
import type { ArchetypeName } from "@features/report/server/archetypeSlug";
import V3ArchetypeCard from "./V3ArchetypeCard";
import V4CoreArchetypeHeading from "./V4CoreArchetypeHeading";
import V4PartHeading from "./V4PartHeading";
import V4Rating from "./V4Rating";
import V4ChapterNudges from "./V4ChapterNudges";
import V4TopThreeSection from "./V4TopThreeSection";
import V4SummaryChapter from "./V4SummaryChapter";

/**
 * Part II — Your Constellation. Figma 1:483, 393x5021.
 *
 * Order and node ids: rule 1:484 · heading 1:486 · separator 1:491 · the three
 * highest-scoring archetypes 1:493 · the Core Archetype heading 1:576 · the
 * archetype card 15:815 · separator 1:734 · Summary 1:736 · Snapshot 1:763 ·
 * rating 1:833.
 *
 * `V3TopThree` is reused unchanged — it already renders 1:493's ranked list from a
 * percentages map, which is exactly the shape the frame's 43.4 / 39.5 / 36.2 take.
 */

interface Props {
  archetype: ArchetypeName;
  matchStrength: number;
  card: Report3CardCopy;
  initialDeckIndex?: number;
}

const V4Part2: FC<Props> = ({ archetype, matchStrength, card, initialDeckIndex = 0 }) => {
  const summary = REPORT_V4_SUMMARY[archetype];

  return (
    <section className="rv4-partblock" data-node-id="1:483" data-name="Part 2 - Your Constellation">
      {/* 1:484 */}
      <div className="rv4-col">
        <div className="rv4-rule" aria-hidden="true" />
      </div>

      <V4PartHeading heading={REPORT_V4_PARTS[1]!} />

      {/* 1:491 */}
      <div className="rv4-sep" aria-hidden="true" />

      {/* 1:493 */}
      <div className="rv4-col">
        <V4TopThreeSection />
      </div>

      {/* 1:576 — in the same gutter column as 1:493 above and 15:815 below. It
       * was the only block in Part II outside `.rv4-col`, which is why its text
       * sat a few px right of the cards on either side of it. */}
      <div className="rv4-col">
        <V4CoreArchetypeHeading />
      </div>

      {/* 15:815 — built and verified in the previous pass. */}
      <div className="rv4-col">
        <V3ArchetypeCard
          archetype={archetype}
          matchStrength={matchStrength}
          copy={card}
          initialDeckIndex={initialDeckIndex}
        />
      </div>

      {/* 1:734 */}
      <div className="rv4-sep" aria-hidden="true" />

      {/* 1:736 — omitted rather than faked for an archetype Mark has not written. */}
      {summary ? <V4SummaryChapter archetype={archetype} summary={summary} /> : null}

      {/* 1:763 — "A Snapshot of what you will learn" over the chapter nudges (663:1089). */}
      <V4ChapterNudges />

      {/* 1:833 */}
      <V4Rating label={`Part II — Your Constellation`} />
    </section>
  );
};

export default V4Part2;
