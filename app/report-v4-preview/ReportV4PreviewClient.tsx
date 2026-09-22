"use client";

import { useState, type FC } from "react";
import V4Report from "@features/report/ui/v3/V4Report";
import ReportPricingModal from "@features/report/ui/ReportPricingModal";
import type { ArchetypeName } from "@features/report/server/archetypeSlug";
import type { ReportAccessPlan } from "@features/report/server/access";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import type { ReportPurchasePlanId } from "@features/checkout/server/reportPurchase";
import type { Report3CardCopy } from "@/data/report3-archetype-card";
import type { V4LearnMoreByChapter } from "@/data/report3-learn-more";

// reportV3.css is imported by ReportPage.tsx, never by the root layout, so a
// standalone preview has to pull it in itself or every `rv3-`/`rv4-` rule is missing.
import "@features/report/ui/v3/reportV3.css";
// ReportPricingModal is styled entirely out of report.css — `.report-pricing-*`
// and `.report-pricing-modal__*` appear there and nowhere in reportV3.css — so the
// modal needs it too. app/practice-preview/PracticePreviewClient.tsx imports it the
// same way, and ReportPage.tsx loads both in this order in production.
import "@features/report/ui/report.css";

interface Props {
  archetype: ArchetypeName;
  matchStrength: number;
  copy: Report3CardCopy;
  /** Already gated and stripped on the server — see page.tsx. */
  learnMore: V4LearnMoreByChapter;
  /** What `?plan=` resolved to. */
  accessPlan: ReportAccessPlan;
  /** The same, named in the preview bar. */
  accessPlanLabel: string;
  /** List prices, built from the repo's price table — see previewQuotes.ts. */
  quotes: Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot>;
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
 *
 * THE PAYWALL IS LIVE HERE. `onUnlock` used to be omitted, which made the gate band
 * on a locked "Go deeper & learn more" card — the blurred window, "Show More" and
 * the Premium card — a dead click: the only control that responded was the expand
 * toggle, so the card appeared to do nothing but reveal more blur. It is wired now,
 * so this route exercises the same path the real report will.
 *
 * Checkout is not: the modal's own `onUnlock` closes it rather than calling Stripe,
 * because a token-free preview has no submission to buy against. That absence also
 * keeps the preview out of the analytics table — `persistAnalyticsEvent` drops any
 * event with no `window.__loveiqReportSubmissionId`, which this page never sets.
 */
const ReportV4PreviewClient: FC<Props> = ({
  archetype,
  matchStrength,
  copy,
  learnMore,
  accessPlan,
  accessPlanLabel,
  quotes,
}) => {
  const [paywallOpen, setPaywallOpen] = useState(false);

  return (
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
            onUnlock={() => setPaywallOpen(true)}
          />
        </div>
      </div>

      <ReportPricingModal
        accessPlan={accessPlan}
        archetype={archetype}
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onUnlock={() => setPaywallOpen(false)}
        primaryArchetype={archetype}
        quotes={quotes}
      />

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
};

export default ReportV4PreviewClient;
