"use client";

import type { FC } from "react";

interface Props {
  archetype: string;
  sectionTitle: string;
  onUnlock?: () => void;
}

const PremiumOverlay: FC<Props> = ({ archetype, sectionTitle, onUnlock }) => (
  <div className="report-premium-overlay">
    <div className="report-premium-overlay__card">
      <div className="report-premium-overlay__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8">
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </div>

      <h3 className="report-premium-overlay__title">Premium Content</h3>

      <div className="report-premium-overlay__badges-group" aria-hidden="true">
        <span className="report-premium-overlay__badges-label">Included in:</span>
        <div className="report-premium-overlay__badges-row">
          <span className="report-premium-overlay__badge report-premium-overlay__badge--essentials">
            Essentials
          </span>
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
