import type { FC } from "react";
import {
  REPORT_V4_CORE_ARCHETYPE_LEDE,
  REPORT_V4_OTHER_ARCHETYPE_TITLE,
  reportV4OtherArchetypeLede,
} from "@/data/report3-archetype-page";
import V4Runs from "./V4Runs";

/**
 * "Core Archetype" heading — Report V4, Figma 1:576, 361x148.
 *
 * Named "Chapter H1 + Copy / Non Expandable + Archetype Colored" in the file: the
 * same head-and-copy shape as a chapter row but with no chevron and no collapse,
 * and with the second word carrying the archetype's ink (--rv3-name-ink). Its title is
 * tracked at -0.8px, tighter than either chapter variant.
 *
 * Over one of the reader's other archetypes it says so and names their core one
 * (`coreArchetype`): it read "your core archetype" over any of the 14 (Marcus, 27.10).
 */

interface Props {
  /** The reader's core archetype, when the card below is another of theirs. */
  coreArchetype?: string;
}

const V4CoreArchetypeHeading: FC<Props> = ({ coreArchetype }) => (
  <div
    className="rv4-corehead"
    data-node-id="1:576"
    data-name="Chapter H1 + Copy / Non Expandable + Archetype Colored"
  >
    <h2 className="rv4-corehead__title" data-node-id="1:578">
      {coreArchetype ? REPORT_V4_OTHER_ARCHETYPE_TITLE : "Core"}{" "}
      <span className="rv4-corehead__accent">Archetype</span>
    </h2>
    <p className="rv4-corehead__lede" data-node-id="1:580">
      <V4Runs
        runs={
          coreArchetype ? reportV4OtherArchetypeLede(coreArchetype) : REPORT_V4_CORE_ARCHETYPE_LEDE
        }
      />
    </p>
  </div>
);

export default V4CoreArchetypeHeading;
