"use client";

import type { FC } from "react";

import { SUMMARY_HEADING } from "@/data/report2-archetype-summary";

/**
 * The report's closing chapter (Figma 8427:2837, "Article - CLOSING (free)").
 *
 * It was titled "Where this leaves you" and carried one hardcoded paragraph. On
 * 2026-08-26 Mark asked for it to become "Summary", holding the whole of chapter
 * 3 ("Core Archetype") from the source document.
 *
 * So it now takes a `summary` prop:
 *   - given the chapter-3 paragraphs, it renders them under "Summary";
 *   - given `null`, it falls back to the original closing paragraph.
 *
 * The fallback is not politeness. The hardcoded paragraph names the Spiritual
 * Lover's own three conditions ("presence before arousal · repair before desire ·
 * invitation before initiation") despite the comment that used to call it
 * universal, and only the Spark Seeker has a chapter-3 block in the layer today —
 * so the thirteen archetypes without one keep exactly what they render now
 * instead of losing their ending.
 *
 * TWO THINGS TO FLAG, both copy decisions rather than code ones:
 *   - the chapter-3 text is third person ("The Spark Seeker experiences…") in a
 *     report that speaks to the reader in second person everywhere else. That is
 *     the same objection that retired the pre-2.0 `summary` chapter — see
 *     `RETIRED_REPORT_SECTION_IDS` in `../reportNav.ts`.
 *   - it also covers the same ground as the Core Archetype chapter at the top of
 *     the report, which is where the reader first meets this material.
 */

interface Props {
  /**
   * Chapter 3 of the source document, one entry per paragraph, resolved and
   * gated server-side. `null` ⇒ the original closing paragraph.
   */
  summary?: string[] | null;
}

const ClosingSection: FC<Props> = ({ summary = null }) => {
  const hasSummary = !!summary && summary.length > 0;

  return (
    <section
      className="report-closing"
      aria-label={hasSummary ? SUMMARY_HEADING : "Where this leaves you"}
    >
      <div className="report-closing__panel">
        <p className="report-closing__eyebrow">
          {hasSummary ? SUMMARY_HEADING : "Where this leaves you"}
        </p>
        {hasSummary ? (
          summary.map((para, i) => (
            <p key={i} className="report-closing__body report-closing__body--summary">
              {para}
            </p>
          ))
        ) : (
          <p className="report-closing__body">
            Your sexuality isn&apos;t complicated — it&apos;s{" "}
            <strong className="report-closing__body-strong">conditional</strong>, and this report
            names the conditions:{" "}
            <span className="report-closing__body-accent">
              presence before arousal · repair before desire · invitation before initiation
            </span>
            . When those are honored, you&apos;re not the &quot;difficult&quot; archetype.
            You&apos;re one of the most devoted, present, and quietly erotic ways a person can love.
          </p>
        )}
      </div>
    </section>
  );
};

export default ClosingSection;
