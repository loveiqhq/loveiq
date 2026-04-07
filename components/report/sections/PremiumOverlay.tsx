"use client";

import type { FC } from "react";

interface Props {
  archetype: string;
  sectionTitle: string;
}

const PremiumOverlay: FC<Props> = ({ archetype, sectionTitle }) => (
  <div className="report-premium-overlay">
    <div className="report-premium-overlay__card">
      <div className="report-premium-overlay__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </div>

      <p className="report-overline">Full report chapter</p>
      <h3 className="report-premium-overlay__title">{sectionTitle}</h3>
      <p className="report-premium-overlay__copy">
        Unlock the full <strong>{archetype}</strong> report to read this section in full and keep
        the chapter navigation open throughout the report.
      </p>

      <button type="button" className="report-button">
        Unlock full report
      </button>
    </div>
  </div>
);

export default PremiumOverlay;
