"use client";

import { useState, type FC } from "react";
import { getReportTheme, getReportThemeIconStyle } from "../reportTheme";

interface Props {
  generalHtml: string;
  percentages: Record<string, number>;
  primaryArchetype: string;
  ranking: string[];
}

const INITIAL_COUNT = 3;
const EXPANDED_COUNT = 6;

const LockIcon: FC = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <rect x="3" y="7" width="10" height="6.5" rx="1.5" />
    <path d="M5 7V5.5a3 3 0 0 1 6 0V7" />
  </svg>
);

const ChevronIcon: FC<{ up?: boolean }> = ({ up }) => (
  <svg
    viewBox="0 0 10 6"
    fill="none"
    aria-hidden="true"
    style={up ? { transform: "rotate(180deg)" } : undefined}
  >
    <path
      d="M1 1l4 4 4-4"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ArchetypeProbabilitySection: FC<Props> = ({
  generalHtml,
  percentages,
  primaryArchetype,
  ranking,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const primaryTheme = getReportTheme(primaryArchetype);
  const primaryScore = Math.round(percentages[primaryArchetype] ?? 0);
  const PrimaryIcon = primaryTheme.Icon;

  const visibleCount = expanded ? EXPANDED_COUNT : INITIAL_COUNT;
  const secondaryItems = ranking.filter((n) => n !== primaryArchetype).slice(0, visibleCount - 1);

  return (
    <div className="space-y-10">
      <div className="report-prose" dangerouslySetInnerHTML={{ __html: generalHtml }} />

      <div className="report-prob">
        <span className="report-prob__orb report-prob__orb--bl" aria-hidden="true" />
        <span className="report-prob__orb report-prob__orb--tr" aria-hidden="true" />

        {/* Header */}
        <div className="report-prob__header">
          <span>Matching Score</span>
          <span>Archetype &amp; Motto</span>
        </div>

        {/* Primary archetype — always colorized */}
        <div
          className="report-prob__hero"
          style={{
            borderColor: primaryTheme.accent,
            ["--prob-accent" as string]: primaryTheme.accent,
            ["--prob-accent-rgb" as string]: primaryTheme.accentRgb,
          }}
        >
          <span className="report-prob__hero-glow report-prob__hero-glow--l" aria-hidden="true" />
          <span className="report-prob__hero-glow report-prob__hero-glow--r" aria-hidden="true" />

          <div className="report-prob__hero-score">
            <span className="report-prob__pill">Dominant Match</span>
            <div className="report-prob__hero-value">
              <span>{primaryScore}</span>
              <small>%</small>
            </div>
            <div className="report-prob__hero-bar">
              <div style={{ width: `${Math.min(primaryScore, 100)}%` }} />
            </div>
          </div>

          <div className="report-prob__hero-profile">
            <h4>{primaryArchetype}</h4>
            <p>{primaryTheme.motto}</p>
          </div>

          <div
            className="report-prob__hero-icon"
            style={getReportThemeIconStyle(primaryTheme, "hero")}
          >
            <PrimaryIcon className="report-prob__hero-icon-svg" />
          </div>

          <button className="report-prob__hero-cta" type="button">
            <LockIcon />
            <span>Unlock Full Report</span>
          </button>
        </div>

        {/* Secondary archetypes */}
        <div className="report-prob__list">
          {secondaryItems.map((name, i) => {
            const score = Math.round(percentages[name] ?? 0);
            const theme = getReportTheme(name);
            const ArchIcon = theme.Icon;
            const isHovered = hoveredName === name;
            const isLast = i === secondaryItems.length - 1;
            // 3rd item (i===1) fades more in collapsed view
            const isFading = !expanded && i === 1;
            const rowIconStyle = {
              ...getReportThemeIconStyle(theme, "row"),
              ...(isHovered ? { background: theme.accent } : {}),
            };

            return (
              <div
                key={name}
                className={["report-prob__row", isHovered && "is-active", isFading && "is-fading"]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  isHovered
                    ? {
                        ["--prob-row-accent" as string]: theme.accent,
                        ["--prob-row-accent-rgb" as string]: theme.accentRgb,
                      }
                    : undefined
                }
                onMouseEnter={() => setHoveredName(name)}
                onMouseLeave={() => setHoveredName(null)}
              >
                <div className="report-prob__row-score">
                  <div className="report-prob__row-value">
                    <span>{score}</span>
                    <small>%</small>
                  </div>
                  <div className="report-prob__row-bar">
                    <div
                      style={{
                        width: `${Math.min(score, 100)}%`,
                        background: isHovered ? theme.accent : undefined,
                      }}
                    />
                  </div>
                </div>

                <div className="report-prob__row-profile">
                  <div className="report-prob__row-icon" style={rowIconStyle}>
                    <ArchIcon className="report-prob__row-icon-svg" />
                  </div>
                  <div>
                    <h4 className="report-prob__row-name">{name}</h4>
                    <p
                      className="report-prob__row-motto"
                      style={isHovered ? { color: theme.accent } : undefined}
                    >
                      {theme.motto}
                    </p>
                  </div>
                </div>

                <button
                  className={`report-prob__row-cta ${isHovered ? "is-active" : ""}`}
                  style={
                    isHovered
                      ? { background: theme.accent, borderColor: "transparent", color: "#fff" }
                      : undefined
                  }
                  type="button"
                >
                  <LockIcon />
                  <span>Unlock Full Report</span>
                </button>

                {!isLast && !isHovered && <div className="report-prob__row-border" />}
              </div>
            );
          })}
        </div>

        {/* Toggle */}
        <button
          className="report-prob__toggle"
          type="button"
          onClick={() => setExpanded((v) => !v)}
        >
          <span>{expanded ? "Hide archetype percentages" : "Show more archetypes"}</span>
          <ChevronIcon up={expanded} />
        </button>
      </div>
    </div>
  );
};

export default ArchetypeProbabilitySection;
