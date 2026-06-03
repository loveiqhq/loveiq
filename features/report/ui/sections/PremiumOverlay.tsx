"use client";

import type { FC } from "react";

export type PremiumOverlayTier = "essentials" | "full_report";

interface Props {
  archetype: string;
  sectionTitle: string;
  tier: PremiumOverlayTier;
  onUnlock?: () => void;
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

const DocumentIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
    <path d="M8 13h8" />
    <path d="M8 17h6" />
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

const PremiumOverlay: FC<Props> = ({ archetype, tier, onUnlock }) => (
  <div className="report-premium-overlay">
    <div className="report-premium-overlay__card">
      <div className="report-premium-overlay__icon" aria-hidden="true">
        <LockIcon />
      </div>

      <h3 className="report-premium-overlay__title">Premium Content</h3>

      <p className="report-premium-overlay__copy">
        This section is part of the full report of the <strong>{archetype}</strong>. Unlock it to
        keep reading.
      </p>

      <div className="report-premium-overlay__features">
        <div className="report-premium-overlay__feature report-premium-overlay__feature--green">
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
            <DocumentIcon />
          </span>
          <span className="report-premium-overlay__feature-text">
            <span className="report-premium-overlay__feature-title">
              50+ pages of deep, personalised insight
            </span>
            <span className="report-premium-overlay__feature-sub">
              Into how you love, desire, and connect
            </span>
          </span>
        </div>

        <div className="report-premium-overlay__feature report-premium-overlay__feature--purple">
          <span className="report-premium-overlay__feature-icon" aria-hidden="true">
            <FlaskIcon />
          </span>
          <span className="report-premium-overlay__feature-text">
            <span className="report-premium-overlay__feature-title">
              <span className="report-premium-overlay__feature-lead">Based on </span>100+ science
              papers
            </span>
            <span className="report-premium-overlay__feature-sub">
              Built on attachment, arousal, and intimacy science
            </span>
          </span>
        </div>
      </div>

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

      <button type="button" className="report-premium-overlay__cta" onClick={onUnlock}>
        Unlock your report
      </button>
    </div>
  </div>
);

export default PremiumOverlay;
