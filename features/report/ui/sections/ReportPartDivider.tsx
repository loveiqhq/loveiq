"use client";

import type { FC } from "react";

/**
 * The big centered "PART N" divider that opens each of the report's four parts
 * (Figma 8427:794 / 1440 / 1751 / 2554). An eyebrow ("PART I"), a Lora heading
 * with an optional italic-purple accent word, over a soft gradient glow.
 * Universal, free, no gating — purely structural chrome.
 */
export interface ReportPartDividerProps {
  /** Eyebrow, e.g. "Part I". */
  part: string;
  /** Heading text before the accent word. */
  lead: string;
  /** Optional italic-purple accent word (Figma `#795fc8`). */
  accent?: string;
  /** Heading text after the accent word. */
  tail?: string;
}

const ReportPartDivider: FC<ReportPartDividerProps> = ({ part, lead, accent, tail }) => (
  <div className="report-part-divider">
    <span className="report-part-divider__glow" aria-hidden="true" />
    <p className="report-part-divider__eyebrow">{part}</p>
    <h2 className="report-part-divider__heading">
      {lead}
      {accent ? <em className="report-part-divider__accent">{accent}</em> : null}
      {tail}
    </h2>
  </div>
);

export default ReportPartDivider;
