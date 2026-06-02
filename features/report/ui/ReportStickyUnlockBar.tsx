"use client";

import type { FC } from "react";

import { trackBeginCheckout, trackStickyUnlockClicked } from "@features/analytics/client";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

interface Props {
  quote: ReportPriceQuoteSnapshot | null;
  onCheckout: () => void;
  hidden?: boolean;
  archetype?: string | null;
}

const ArrowRight: FC = () => (
  <svg
    className="rpm-cta__arrow"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ReportStickyUnlockBar: FC<Props> = ({ quote, onCheckout, hidden = false, archetype }) => {
  const handleClick = (variant: "mobile" | "desktop") => () => {
    trackStickyUnlockClicked({ variant, archetype });
    if (quote) {
      trackBeginCheckout("full_report", quote.currentPriceCents / 100, quote.currency);
    }
    onCheckout();
  };

  return (
    <>
      {/* ── Mobile sticky bar (Figma 7635:13896) ──────────────────────────── */}
      <div
        className="report-sticky-unlock report-sticky-unlock--mobile"
        aria-hidden={hidden || undefined}
        inert={hidden}
      >
        <p className="report-sticky-unlock__guarantee">14-day money-back guarantee</p>
        <button
          type="button"
          className="report-sticky-unlock__cta report-sticky-unlock__cta--mobile rpm-cta"
          onClick={handleClick("mobile")}
          aria-label="Unlock full report"
        >
          <span className="rpm-cta__wash" aria-hidden="true" />
          <span className="rpm-cta__reveal" aria-hidden="true" />
          <span className="report-sticky-unlock__cta-label rpm-cta__label">Unlock full report</span>
        </button>
      </div>

      {/* ── Desktop sticky CTA (Figma 7635:13901) ─────────────────────────── */}
      <div
        className="report-sticky-unlock report-sticky-unlock--desktop"
        aria-hidden={hidden || undefined}
        inert={hidden}
      >
        <div className="report-sticky-unlock__desktop-inner">
          <div className="report-sticky-unlock__desktop-copy">
            <h3 className="report-sticky-unlock__heading">Ready to meet yourself?</h3>
            <p className="report-sticky-unlock__guarantee-line">
              <span className="report-sticky-unlock__guarantee-strong">14-day money-back</span>{" "}
              <span className="report-sticky-unlock__guarantee-tail">if it doesn&rsquo;t land</span>
            </p>
          </div>
          <button
            type="button"
            className="report-sticky-unlock__cta report-sticky-unlock__cta--desktop rpm-cta"
            onClick={handleClick("desktop")}
            aria-label="Unlock full report"
          >
            <span className="rpm-cta__wash" aria-hidden="true" />
            <span className="rpm-cta__reveal" aria-hidden="true" />
            <span className="report-sticky-unlock__cta-label rpm-cta__label">
              Unlock full report
            </span>
            <ArrowRight />
          </button>
        </div>
      </div>
    </>
  );
};

export default ReportStickyUnlockBar;
