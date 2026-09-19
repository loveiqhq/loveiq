"use client";

import type { FC } from "react";
import V4Report from "@features/report/ui/v3/V4Report";
import type { ArchetypeName } from "@features/report/server/archetypeSlug";
import type { Report3CardCopy } from "@/data/report3-archetype-card";
import type { V4LearnMoreByChapter } from "@/data/report3-learn-more";

// reportV3.css is imported by ReportPage.tsx, never by the root layout, so a
// standalone preview has to pull it in itself or every `rv3-`/`rv4-` rule is missing.
import "@features/report/ui/v3/reportV3.css";

interface Props {
  archetype: ArchetypeName;
  matchStrength: number;
  copy: Report3CardCopy;
  /** Already gated and stripped on the server — see page.tsx. */
  learnMore: V4LearnMoreByChapter;
  /** What `?plan=` resolved to, named in the preview bar. */
  accessPlanLabel: string;
}

/**
 * Preview chrome — one rule and one label, nothing else.
 *
 * The `.rv4-doc` class on the report column is load-bearing, not cosmetic.
 * `reportV3.css` carries real breakpoints — `@media (min-width: 700px)` turns the
 * science deck into a two-column grid and `(min-width: 1280px)` into three, hiding
 * its pagination dots and sizing `.rv3-prose` up to 17/28. Media queries resolve
 * against the BROWSER viewport, not an ancestor's width, so a 393px column inside a
 * laptop window would silently render the desktop report. An iframe would be the
 * textbook fix, but `proxy.ts` sets `frame-ancestors 'none'` and
 * `X-Frame-Options: DENY` for every route, and weakening a global security header
 * for a preview is not a trade worth making. So `.rv4-doc` re-asserts the mobile
 * rules instead — see the scoped block at the end of reportV3.css.
 */
const ReportV4PreviewClient: FC<Props> = ({
  archetype,
  matchStrength,
  copy,
  learnMore,
  accessPlanLabel,
}) => (
  <main className="rv4-preview">
    <header className="rv4-preview__bar">
      <strong>Report V4 — MOBILE</strong>
      <span> · Figma 1:165 · 393px canvas · {archetype}</span>
      <span className="rv4-preview__plan">
        reader: <strong>{accessPlanLabel}</strong> · <a href="?plan=none">no purchase</a> ·{" "}
        <a href="?plan=full_report">full_report</a>
      </span>
    </header>

    <div className="rv4-preview__frame">
      <div className="rv3 rv4-doc">
        <V4Report
          archetype={archetype}
          matchStrength={matchStrength}
          card={copy}
          learnMore={learnMore}
        />
      </div>
    </div>

    <style>{`
      .rv4-preview {
        background: #f4f2ef;
        min-height: 100vh;
        padding: 0 0 80px;
      }
      .rv4-preview__bar {
        background: #fff;
        border-bottom: 1px solid #e7e3e8;
        color: #57505c;
        font: 13px/1.5 var(--font-sans), system-ui, sans-serif;
        padding: 12px 20px;
      }
      .rv4-preview__bar strong { color: #151117; }
      /* Outside the 393px canvas on purpose: the report column stays exactly as
         the frame draws it, and the plan switch lives in the grey chrome. */
      .rv4-preview__plan { float: right; }
      .rv4-preview__plan a { color: #561dbd; }
      /* The honest bit: a hard 393px column, ruled so the canvas edge is visible. */
      .rv4-preview__frame {
        background: #fff;
        margin: 40px auto;
        outline: 1px dashed #d3ccd6;
        width: 393px;
      }
    `}</style>
  </main>
);

export default ReportV4PreviewClient;
