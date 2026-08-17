"use client";

import type { FC } from "react";

/**
 * The report's closing note (Figma 8427:2837, "Article - CLOSING (free)").
 *
 * UNIVERSAL + FREE — the same copy for every archetype, no gating, no CTA. The
 * text lives only in the Figma frame (it is not part of the per-archetype copy
 * matrix), so it is hardcoded here verbatim per the pixel spec. Mounts LAST in
 * the report content, right before the footer.
 *
 * ponytail: hardcoded copy, no props — this is a fixed universal card. If it
 * ever needs to vary per archetype, thread a `copy` prop like the other Report
 * 2.0 sections; until then a prop would be dead flexibility.
 */
const ClosingSection: FC = () => (
  <section className="report-closing" aria-label="Where this leaves you">
    <div className="report-closing__panel">
      <p className="report-closing__eyebrow">Where this leaves you</p>
      <p className="report-closing__body">
        Your sexuality isn&apos;t complicated — it&apos;s{" "}
        <strong className="report-closing__body-strong">conditional</strong>, and this report names
        the conditions:{" "}
        <span className="report-closing__body-accent">
          presence before arousal · repair before desire · invitation before initiation
        </span>
        . When those are honored, you&apos;re not the &quot;difficult&quot; archetype. You&apos;re
        one of the most devoted, present, and quietly erotic ways a person can love.
      </p>
    </div>
  </section>
);

export default ClosingSection;
