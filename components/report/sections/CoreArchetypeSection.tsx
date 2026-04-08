"use client";

import type { FC } from "react";
import { TraitIcons, type ReportTheme } from "../reportTheme";

interface Props {
  archetypeHtml: string | null;
  theme: ReportTheme;
}

const CoreArchetypeSection: FC<Props> = ({ archetypeHtml, theme }) => {
  const { Icon } = theme;

  return (
    <div className="space-y-10">
      <article className="report-hero-card">
        {/* Glow orbs */}
        <span className="report-hero-card__orb report-hero-card__orb--tr" aria-hidden="true" />
        <span className="report-hero-card__orb report-hero-card__orb--bl" aria-hidden="true" />

        {/* Header: icon + name + motto */}
        <div className="report-hero-card__header">
          <div className="report-hero-card__icon-frame">
            <Icon className="report-hero-card__icon" />
          </div>
          <div className="report-hero-card__header-copy">
            <h3 className="report-hero-card__title">{theme.archetype}</h3>
            <p className="report-hero-card__motto">{theme.motto}</p>
          </div>
        </div>

        {/* Body */}
        <div className="report-hero-card__content">
          <p className="report-hero-card__label">Behavioral tendencies:</p>

          <div className="report-hero-card__motivation">
            <div className="report-hero-card__motivation-icon" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none" className="size-full">
                <circle
                  cx="20"
                  cy="20"
                  r="19.25"
                  stroke="rgb(var(--report-accent-rgb))"
                  strokeOpacity="0.95"
                  strokeWidth="1.5"
                />
                <circle
                  cx="20"
                  cy="20"
                  r="8"
                  stroke="rgb(var(--report-accent-rgb))"
                  strokeOpacity="0.95"
                  strokeWidth="3"
                />
              </svg>
            </div>
            <div className="report-hero-card__motivation-copy">
              <p className="report-hero-card__motivation-label">Core motivation:</p>
              <p className="report-hero-card__motivation-value">{theme.motivation}</p>
            </div>
          </div>

          <div className="report-hero-card__traits">
            <TraitItem
              label="Communication"
              value={theme.communication}
              icon={TraitIcons.communication}
            />
            <TraitItem label="Initiation" value={theme.initiation} icon={TraitIcons.initiation} />
            <TraitItem label="Attachment" value={theme.attachment} icon={TraitIcons.attachment} />
            <TraitItem
              label="Power orientation"
              value={theme.powerOrientation}
              icon={TraitIcons.powerOrientation}
            />
          </div>

          <div className="report-hero-card__progress">
            <ProgressRow
              label="Risk orientation"
              segments={theme.riskSegments}
              value={theme.riskOrientation}
            />
            <ProgressRow
              label="Typical confidence"
              segments={theme.confidenceSegments}
              value={theme.confidence}
            />
          </div>
        </div>
      </article>

      {archetypeHtml ? (
        <div className="report-prose" dangerouslySetInnerHTML={{ __html: archetypeHtml }} />
      ) : null}
    </div>
  );
};

const TraitItem: FC<{
  icon: FC<{ className?: string }>;
  label: string;
  value: string;
}> = ({ icon: Icon, label, value }) => (
  <div className="report-trait">
    <p className="report-trait__label">
      <Icon className="report-trait__icon" />
      <span>{label}</span>
    </p>
    <p className="report-trait__value">{value}</p>
  </div>
);

const ProgressRow: FC<{
  label: string;
  segments: 1 | 2 | 3;
  value: string;
}> = ({ label, segments, value }) => (
  <div className="report-progress">
    <div className="report-progress__header">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
    <div className="report-progress__segments" aria-hidden="true">
      {[0, 1, 2].map((segment) => (
        <span key={`${label}-${segment}`} className={segment < segments ? "is-filled" : ""} />
      ))}
    </div>
  </div>
);

export default CoreArchetypeSection;
