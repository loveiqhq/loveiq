"use client";

import type { FC } from "react";

import { trackBeginCheckout } from "@/lib/analytics";
import { formatReportPurchasePrice } from "@/lib/checkout/reportPurchase";
import type { ReportPriceQuoteSnapshot } from "@/lib/pricing/reportPricing";

interface Props {
  quote: ReportPriceQuoteSnapshot | null;
  onCheckout: () => void;
  hidden?: boolean;
}

const ArrowRight: FC = () => (
  <svg
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

const ReportStickyUnlockBar: FC<Props> = ({ quote, onCheckout, hidden = false }) => {
  const handleClick = () => {
    if (quote) {
      trackBeginCheckout("full_report", quote.currentPriceCents / 100, quote.currency);
    }
    onCheckout();
  };

  const price = quote ? formatReportPurchasePrice(quote.currentPriceCents) : "€9.99";

  return (
    <>
      {/* ── Mobile sticky bar (Figma 7162:1915) ───────────────────────────── */}
      <div
        className="report-sticky-unlock report-sticky-unlock--mobile"
        aria-hidden={hidden || undefined}
        inert={hidden}
      >
        <p className="report-sticky-unlock__guarantee">14-day money-back guarantee</p>
        <button
          type="button"
          className="report-sticky-unlock__cta"
          onClick={handleClick}
          aria-label="Unlock full report"
        >
          <span className="report-sticky-unlock__cta-label">Unlock full report</span>
        </button>
        <p className="report-sticky-unlock__price">
          <span className="report-sticky-unlock__price-value">{price}</span>
          <span className="report-sticky-unlock__price-suffix"> once, yours forever.</span>
        </p>
      </div>

      {/* ── Desktop sticky CTA (Figma 7128:19040) ─────────────────────────── */}
      <div
        className="report-sticky-unlock report-sticky-unlock--desktop"
        aria-hidden={hidden || undefined}
        inert={hidden}
      >
        <div className="report-sticky-unlock__desktop-inner">
          <h3 className="report-sticky-unlock__heading">Ready to dive deep?</h3>
          <div className="report-sticky-unlock__stats">
            <p className="report-sticky-unlock__stats-line">
              <span className="report-sticky-unlock__stats-num">32</span>
              <span className="report-sticky-unlock__stats-text"> chapters. </span>
              <span className="report-sticky-unlock__stats-num">~50</span>
              <span className="report-sticky-unlock__stats-text"> pages. </span>
              <span className="report-sticky-unlock__stats-num">{price}</span>
              <span className="report-sticky-unlock__stats-text"> once, yours forever.</span>
            </p>
            <p className="report-sticky-unlock__stats-line">
              <span className="report-sticky-unlock__stats-num">14-day money-back</span>
              <span className="report-sticky-unlock__stats-text"> if it&rsquo;s not for you.</span>
            </p>
          </div>
          <button
            type="button"
            className="report-sticky-unlock__cta report-sticky-unlock__cta--desktop"
            onClick={handleClick}
            aria-label="Unlock full report"
          >
            <span className="report-sticky-unlock__cta-label">Unlock full report</span>
            <ArrowRight />
          </button>
        </div>
      </div>
    </>
  );
};

export default ReportStickyUnlockBar;
