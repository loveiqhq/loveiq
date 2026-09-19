import Image from "next/image";
import type { FC } from "react";

/**
 * The "Premium content" card that floats over a gated article — Figma 153:2300.
 *
 * NOT a reuse of features/report/ui/sections/PremiumOverlay.tsx, for two reasons.
 * It is a different card: no price, no strike-through, no "SAVE" pill, no science
 * row, and the CTA reads "Unlock full report" rather than "Unlock your report".
 * And PremiumOverlay's DOM is bound to `.report-premium-overlay__*` in
 * report.css, which the V4 surfaces never load.
 *
 * Purely presentational, and deliberately WITHOUT its own onClick: the gate band
 * around it owns the handler, so a tap anywhere on the blurred block opens the
 * paywall. PremiumOverlay.tsx:214-221 records why both firing is a bug — it
 * opened the pricing modal twice. The click still bubbles, so Enter and Space on
 * this button behave exactly as a button should.
 *
 * The geometry is a uniform x0.71941 scale of a larger original — 0.719 was 1px,
 * 17.268 was 24, 162.604 was 226 — so the fractional numbers are the design, not
 * rounding noise, and are kept as drawn.
 */

const V4PremiumCard: FC = () => (
  <div className="rv4-premium" data-node-id="153:2301" data-name="Premium content card">
    {/* 153:2303 */}
    <div className="rv4-premium__head">
      <span className="rv4-premium__badge" aria-hidden="true">
        <Image src="/report/v3/learn/padlock.svg" alt="" width={10} height={10} unoptimized />
      </span>
      <h3 className="rv4-premium__title">Premium content</h3>
    </div>

    {/* 153:2309 */}
    <div className="rv4-premium__guarantee">
      <span className="rv4-premium__shield" aria-hidden="true">
        <Image
          className="rv4-premium__shield-bg"
          src="/report/v3/learn/guarantee-shield.svg"
          alt=""
          width={29}
          height={29}
          unoptimized
        />
        <Image
          className="rv4-premium__shield-tick"
          src="/report/v3/learn/guarantee-check.svg"
          alt=""
          width={9}
          height={14}
          unoptimized
        />
      </span>
      <span className="rv4-premium__guarantee-text">
        <span className="rv4-premium__guarantee-head">14-day money-back guarantee</span>
        <span className="rv4-premium__guarantee-sub">No questions asked.</span>
      </span>
    </div>

    {/* 153:2320 */}
    <button type="button" className="rv4-premium__cta">
      Unlock full report
    </button>
  </div>
);

export default V4PremiumCard;
