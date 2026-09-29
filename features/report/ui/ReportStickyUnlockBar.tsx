"use client";

import Image from "next/image";
import { useEffect, useRef, type FC } from "react";

import { trackStickyUnlockClicked } from "@features/analytics/client";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

interface Props {
  quote: ReportPriceQuoteSnapshot | null;
  onCheckout: () => void;
  hidden?: boolean;
  archetype?: string | null;
  /**
   * Report V4's mobile footer (Mark, 29.09, 1945950396: 1005:411). The bar renders
   * outside the V4 providers, so the page says so.
   */
  v4?: boolean;
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

const ReportStickyUnlockBar: FC<Props> = ({
  quote,
  onCheckout,
  hidden = false,
  archetype,
  v4 = false,
}) => {
  const mobileRef = useRef<HTMLDivElement>(null);
  const desktopRef = useRef<HTMLDivElement>(null);

  // Publish the height this bar occupies as `--report-unlock-bar-h`, as
  // ConsentBannerOffset publishes `--liq-consent-h`, so floating UI of the report's
  // own (V4's "Back to top") can sit clear of it. It is not a constant: safe-area
  // padding on a phone, and a stacked card with vw-clamped type from 641 to 1024px.
  // Only one variant is displayed at a time; the other measures 0.
  useEffect(() => {
    const root = document.documentElement;
    const publish = () => {
      const height = Math.max(
        mobileRef.current?.offsetHeight ?? 0,
        desktopRef.current?.offsetHeight ?? 0
      );
      root.style.setProperty("--report-unlock-bar-h", `${height}px`);
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    if (mobileRef.current) observer?.observe(mobileRef.current);
    if (desktopRef.current) observer?.observe(desktopRef.current);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--report-unlock-bar-h");
    };
  }, []);

  const handleClick = (variant: "mobile" | "desktop") => () => {
    trackStickyUnlockClicked({ variant, archetype });
    // begin_checkout is counted by ReportPage.beginCheckout, which onCheckout calls.
    // It used to fire here behind `if (quote)` while onCheckout ran regardless, so an
    // unpriced click reached Stripe untracked — see that function for the numbers.
    onCheckout();
  };

  return (
    <>
      {/* ── Mobile sticky bar (Figma 7635:13896; V4: 1005:411) ─────────────── */}
      <div
        ref={mobileRef}
        className={`report-sticky-unlock report-sticky-unlock--mobile${v4 ? " is-v4" : ""}`}
        aria-hidden={hidden || undefined}
        inert={hidden}
      >
        {v4 ? (
          /* 1005:397 — the paywall card's guarantee box at 0.68. The frame says
           * "7-day"; Fatih, 29.09: the 14 days every surface promises. */
          <div className="report-sticky-unlock__badge" data-node-id="1005:397">
            <span className="report-sticky-unlock__shield" aria-hidden="true">
              <Image
                src="/report/v3/premium/footer-shield.svg"
                alt=""
                width={20}
                height={20}
                unoptimized
              />
              <Image
                src="/report/v3/premium/footer-tick.svg"
                alt=""
                width={9}
                height={11}
                unoptimized
              />
            </span>
            <span className="report-sticky-unlock__badge-text">
              <span className="report-sticky-unlock__badge-head">14-day money-back</span>
              <span className="report-sticky-unlock__badge-sub">
                Guaranteed, no questions asked.
              </span>
            </span>
          </div>
        ) : (
          <p className="report-sticky-unlock__guarantee">14-day money-back guarantee</p>
        )}
        {v4 ? (
          /* 1005:394 — the paywall card's pill, "Unlock Full Report →". */
          <button
            type="button"
            className="report-sticky-unlock__cta--v4"
            onClick={handleClick("mobile")}
            aria-label="Unlock full report"
          >
            Unlock Full Report<span aria-hidden="true">{" →"}</span>
          </button>
        ) : (
          <button
            type="button"
            className="report-sticky-unlock__cta report-sticky-unlock__cta--mobile rpm-cta"
            onClick={handleClick("mobile")}
            aria-label="Unlock full report"
          >
            <span className="rpm-cta__wash" aria-hidden="true" />
            <span className="rpm-cta__reveal" aria-hidden="true" />
            <span className="report-sticky-unlock__cta-label rpm-cta__label">
              Unlock full report
            </span>
          </button>
        )}
      </div>

      {/* ── Desktop sticky CTA (Figma 7635:13901) ─────────────────────────── */}
      <div
        ref={desktopRef}
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
