import type { FC } from "react";
import { REPORT_V4_CORE_ARCHETYPE_LEDE } from "@/data/report3-archetype-page";
import V4Runs from "./V4Runs";

/**
 * "Core Archetype" heading — Report V4, Figma 1:576, 361x148.
 *
 * Named "Chapter H1 + Copy / Non Expandable + Archetype Colored" in the file: the
 * same head-and-copy shape as a chapter row but with no chevron and no collapse,
 * and with the second word carrying the archetype ink (#d63200). Its title is
 * tracked at -0.8px, tighter than either chapter variant.
 */

const V4CoreArchetypeHeading: FC = () => (
  <div
    className="rv4-corehead"
    data-node-id="1:576"
    data-name="Chapter H1 + Copy / Non Expandable + Archetype Colored"
  >
    <h2 className="rv4-corehead__title" data-node-id="1:578">
      Core <span className="rv4-corehead__accent">Archetype</span>
    </h2>
    <p className="rv4-corehead__lede" data-node-id="1:580">
      <V4Runs runs={REPORT_V4_CORE_ARCHETYPE_LEDE} />
    </p>
  </div>
);

export default V4CoreArchetypeHeading;
