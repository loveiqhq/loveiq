"use client";

import type { FC } from "react";

export type PremiumOverlayTier = "essentials" | "full_report";

interface Props {
  archetype: string;
  sectionTitle: string;
  tier: PremiumOverlayTier;
  onUnlock?: () => void;
}

const PremiumOverlay: FC<Props> = ({ archetype, sectionTitle, tier, onUnlock }) => (
  <div className="report-premium-overlay">
    <div className="report-premium-overlay__card">
      <div className="report-premium-overlay__icon" aria-hidden="true">
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
      </div>

      <h3 className="report-premium-overlay__title">Premium Content</h3>

      <div className="report-premium-overlay__badges-group" aria-hidden="true">
        <span className="report-premium-overlay__badges-label">Included in:</span>
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

      <p className="report-premium-overlay__copy">
        To read this section unlock the report of the <strong>{archetype}</strong>
      </p>

      <button type="button" className="report-premium-overlay__cta" onClick={onUnlock}>
        Unlock report
      </button>
    </div>
  </div>
);

export default PremiumOverlay;
