"use client";

import type { FC } from "react";
import { useRevealOnView } from "../hooks/useRevealOnView";

/**
 * The big centered "PART N" divider that opens each of the report's four parts
 * (Figma 8427:794 / 1440 / 1751 / 2554). An eyebrow ("PART I"), a Lora heading
 * with an optional italic-purple accent word, over a soft gradient glow.
 * Universal, free, no gating — purely structural chrome.
 *
 * On arrival the glow blooms open and the eyebrow, heading and accent word settle
 * in after it; the glow then keeps drifting very slowly, so the cloud reads as lit
 * rather than printed. Part I sits at the top of the page, where the observer
 * fires immediately — the bloom plays on load there, which is what a title should
 * do. Choreography is in `app/globals.css`; all of it stops under
 * `prefers-reduced-motion`.
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

const ReportPartDivider: FC<ReportPartDividerProps> = ({ part, lead, accent, tail }) => {
  const [dividerRef, revealed] = useRevealOnView<HTMLDivElement>({ threshold: 0.4 });
  return (
    <div
      ref={dividerRef}
      className={`report-part-divider report-part-reveal${revealed ? " is-revealed" : ""}`}
    >
      <span className="report-part-divider__glow" aria-hidden="true" />
      <p className="report-part-divider__eyebrow">{part}</p>
      <h2 className="report-part-divider__heading">
        {lead}
        {accent ? <em className="report-part-divider__accent">{accent}</em> : null}
        {tail}
      </h2>
    </div>
  );
};

export default ReportPartDivider;
