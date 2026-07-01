"use client";

import { useState, type FC } from "react";
import {
  PaywallCountdownDigits,
  usePaywallCountdownValue,
} from "@features/report/ui/PaywallCountdown";
import { REPORT_PAYWALL_COUNTDOWN_MS } from "@features/survey/ui/hooks/surveySession";
import {
  formatReportPurchasePrice,
  getReportPurchaseBadgeFromPrice,
  getReportPurchaseStrikePrice,
} from "@features/checkout/server/reportPurchase";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

export type PremiumOverlayTier = "essentials" | "full_report";

interface Props {
  archetype: string;
  sectionTitle: string;
  tier: PremiumOverlayTier;
  onUnlock?: () => void;
  /**
   * Live full-report price quote. When present the card renders the real
   * price / strike / "you save" / discount badge (never Figma placeholders),
   * matching the paywall modal exactly. Null while pricing is unavailable —
   * the card then hides the price block but still shows the countdown + CTA.
   */
  quote?: ReportPriceQuoteSnapshot | null;
  /**
   * Shared epoch-ms deadline for the urgency countdown (resolved once per
   * report session by ReportPage, persisted in sessionStorage). Passing the
   * same value to the modal and every card keeps all timers in lock-step.
   * Falls back to a fresh 2-minute window when omitted.
   */
  offerDeadline?: number;
}

const LockIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 9.8V4a2 2 0 0 1 2-2h8a2 2 0 0 1 1.414.586l3.588 3.588A2 2 0 0 1 20 8v12a2 2 0 0 1-2 2h-3" />
    <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    <path d="M9 17v-2a2 2 0 0 0-4 0v2" />
    <rect x="3" y="17" width="8" height="5" rx="1" />
  </svg>
);

const BoltIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13 2 4.5 13.2a.6.6 0 0 0 .48.96H11l-1 8 8.5-11.2a.6.6 0 0 0-.48-.96H12l1-8Z" />
  </svg>
);

const ArrowIcon: FC = () => (
  <svg viewBox="0 0 14 12" fill="none" aria-hidden="true">
    <path
      d="M1 6h11.5M8 1.5 12.5 6 8 10.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ShieldCheckIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const FlaskIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 2h6" />
    <path d="M10 2v6.5L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9.5V2" />
    <path d="M7.5 14h9" />
  </svg>
);

const PremiumOverlay: FC<Props> = ({ archetype, tier, onUnlock, quote = null, offerDeadline }) => {
  // ── Live pricing — identical computation to the paywall modal so the card
  //    and modal always agree. ────────────────────────────────────────────────
  const currentCents = quote?.currentPriceCents ?? 0;
  const msrpCents = quote?.msrpCents ?? null;
  const strikeEligible = typeof msrpCents === "number" && msrpCents > currentCents;
  const priceLabel = quote ? formatReportPurchasePrice(currentCents) : null;
  const strikeLabel = strikeEligible ? getReportPurchaseStrikePrice(msrpCents) : null;
  const saveLabel =
    strikeEligible && msrpCents != null
      ? formatReportPurchasePrice(msrpCents - currentCents)
      : null;
  const badge = quote
    ? getReportPurchaseBadgeFromPrice({ strikeCents: msrpCents, currentCents })
    : null;

  // ── Countdown — same drift-free hook + shared deadline as the modal. ────────
  const [fallbackDeadline] = useState(() =>
    typeof window === "undefined" ? 0 : Date.now() + REPORT_PAYWALL_COUNTDOWN_MS
  );
  const deadline = offerDeadline ?? fallbackDeadline;
  // Reads the shared report-level countdown (one interval for all cards) when
  // rendered under a PaywallCountdownProvider; falls back to a local ticker with
  // `deadline` when standalone (e.g. unit tests).
  const { mm, ss } = usePaywallCountdownValue(deadline);

  // Green offer pill (Figma 8005:744): "⚡ {badge} OFF · SAVE €{save}". The badge
  // already reads "85% OFF"; append the merged "· SAVE €X" when we know the save.
  const pillText = badge ? (saveLabel ? `${badge} · SAVE ${saveLabel}` : badge) : null;

  return (
    <div className="report-premium-overlay">
      <div className="report-premium-overlay__card">
        <div className="report-premium-overlay__head">
          <div className="report-premium-overlay__icon" aria-hidden="true">
            <LockIcon />
          </div>
          <h3 className="report-premium-overlay__title">Premium content</h3>
        </div>

        <p className="report-premium-overlay__copy">
          This section is part of the full <strong>{archetype}</strong> report.{" "}
          <span className="report-premium-overlay__copy-cta">Unlock it to keep reading.</span>
        </p>

        <div className="report-premium-overlay__offer">
          {pillText ? (
            <span className="report-premium-overlay__pill">
              <span className="report-premium-overlay__pill-icon" aria-hidden="true">
                <BoltIcon />
              </span>
              {pillText}
            </span>
          ) : null}

          <span className="report-premium-overlay__timer-label">
            Time left to secure this price
          </span>

          <div className="report-premium-overlay__price-line">
            <PaywallCountdownDigits mm={mm} ss={ss} />
            {priceLabel ? (
              <>
                <span className="report-premium-overlay__arrow" aria-hidden="true">
                  <ArrowIcon />
                </span>
                <span className="report-premium-overlay__price">{priceLabel}</span>
              </>
            ) : null}
          </div>

          {strikeLabel ? (
            <div className="report-premium-overlay__otherwise">
              <span className="report-premium-overlay__otherwise-label">Otherwise</span>
              <span className="report-premium-overlay__strike">{strikeLabel}</span>
            </div>
          ) : null}

          <div className="report-premium-overlay__divider" aria-hidden="true" />

          <div className="report-premium-overlay__features">
            <div className="report-premium-overlay__feature report-premium-overlay__feature--guarantee">
              <span className="report-premium-overlay__feature-icon" aria-hidden="true">
                <ShieldCheckIcon />
              </span>
              <span className="report-premium-overlay__feature-text">
                <span className="report-premium-overlay__feature-title">
                  14-day money-back guarantee
                </span>
                <span className="report-premium-overlay__feature-sub">No questions asked.</span>
              </span>
            </div>

            <div className="report-premium-overlay__feature report-premium-overlay__feature--purple">
              <span className="report-premium-overlay__feature-icon" aria-hidden="true">
                <FlaskIcon />
              </span>
              <span className="report-premium-overlay__feature-text">
                <span className="report-premium-overlay__feature-title">
                  Grounded in 100+ science papers
                </span>
                <span className="report-premium-overlay__feature-sub">
                  Built on attachment, arousal, and intimacy science.
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="report-premium-overlay__badges-group" aria-hidden="true">
          <span className="report-premium-overlay__badges-label">Included in</span>
          <div className="report-premium-overlay__badges-row">
            {tier === "essentials" ? (
              <span className="report-premium-overlay__badge report-premium-overlay__badge--essentials">
                Essentials
              </span>
            ) : null}
            <span className="report-premium-overlay__badge report-premium-overlay__badge--full">
              Full Report
            </span>
          </div>
        </div>

        <button type="button" className="report-premium-overlay__cta" onClick={onUnlock}>
          Unlock your report
        </button>
      </div>
    </div>
  );
};

export default PremiumOverlay;
