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
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6">
          <path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z" />
          <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="12" width="6" height="5" rx="1" />
          <path d="M10.5 12v-1a1.5 1.5 0 0 1 3 0v1" />
        </svg>
      </div>

      <h3 className="report-premium-overlay__title">Premium Content</h3>
      <p className="report-premium-overlay__copy">
        To read this section unlock the full report of the <strong>{archetype}</strong>
      </p>

      <button type="button" className="report-premium-overlay__cta" onClick={onUnlock}>
        Unlock full report
      </button>
    </div>
  </div>
);

export default PremiumOverlay;
