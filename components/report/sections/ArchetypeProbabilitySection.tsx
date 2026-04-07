"use client";

import type { FC } from "react";
import { getReportTheme } from "../reportTheme";

interface Props {
  generalHtml: string;
  percentages: Record<string, number>;
  primaryArchetype: string;
  ranking: string[];
}

const ArchetypeProbabilitySection: FC<Props> = ({
  generalHtml,
  percentages,
  primaryArchetype,
  ranking,
}) => (
  <div className="space-y-10">
    <div className="report-prose" dangerouslySetInnerHTML={{ __html: generalHtml }} />

    <div className="report-card report-probability-card">
      <div className="report-probability-card__header">
        <span>Matching score</span>
        <span>Archetype and motto</span>
      </div>

      <div className="report-probability-card__rows">
        {ranking.map((name) => {
          const score = Math.round(percentages[name] ?? 0);
          const isPrimary = name === primaryArchetype;
          const rowTheme = getReportTheme(name);

          return (
            <div
              key={name}
              className={`report-probability-card__row ${isPrimary ? "is-primary" : ""}`}
            >
              <div className="report-probability-card__score">
                {isPrimary ? (
                  <span className="report-probability-card__pill">Dominant match</span>
                ) : null}
                <div className="report-probability-card__score-value">
                  <span>{score}</span>
                  <small>%</small>
                </div>
              </div>

              <div className="report-probability-card__identity">
                <div
                  className="report-probability-card__dot"
                  style={{ backgroundColor: `rgb(${rowTheme.accentRgb})` }}
                  aria-hidden="true"
                />
                <div>
                  <p className="report-probability-card__name">{name}</p>
                  <p className="report-probability-card__motto">{rowTheme.motto}</p>
                </div>
              </div>

              <div className="report-probability-card__cta">
                {isPrimary ? (
                  <span className="report-sidebar__badge is-free">Unlocked</span>
                ) : (
                  <span className="report-sidebar__badge is-premium">Full Report</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export default ArchetypeProbabilitySection;
