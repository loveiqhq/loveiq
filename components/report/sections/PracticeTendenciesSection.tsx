"use client";

import { useState, type FC } from "react";
import PremiumOverlay from "./PremiumOverlay";
import {
  extractPracticeSectionIntroHtml,
  parsePracticeTendencyGroups,
  type ReportPracticeTendencyGroup,
} from "../reportContent";

interface Props {
  archetype: string;
  archetypeHtml: string | null;
  generalHtml: string;
  isPremium: boolean;
  sectionTitle: string;
}

const PRACTICE_SCALE_COPY =
  "We use a 10-point scale to present these metrics. 10 represents the highest fantasy pull and actual pleasure, and 1 represents the lowest.";

function toMeterWidth(value: number) {
  return `${Math.min(10, Math.max(1, value)) * 10}%`;
}

const PracticeMetric: FC<{
  label: string;
  tone: "fantasy" | "pleasure";
  value: number;
}> = ({ label, tone, value }) => (
  <div className={`report-practice-card__metric report-practice-card__metric--${tone}`} role="cell">
    <span className="report-practice-card__metric-mobile-label">{label}</span>
    <div className="report-practice-card__metric-content">
      <span className="report-practice-card__metric-value">{value}</span>
      <span className="report-practice-card__meter" aria-hidden="true">
        <span className="report-practice-card__meter-fill" style={{ width: toMeterWidth(value) }} />
      </span>
    </div>
  </div>
);

const PracticeCard: FC<{
  group: ReportPracticeTendencyGroup;
}> = ({ group }) => (
  <article className="report-practice-card">
    <span
      className="report-practice-card__glow report-practice-card__glow--tr"
      aria-hidden="true"
    />

    <div className="report-practice-card__header">
      <p className="report-practice-card__eyebrow">
        Typical Sexual Fantasy &amp; Practice Tendencies
      </p>
      <h3 className="report-practice-card__title">{group.title}</h3>
      <p className="report-practice-card__copy">{PRACTICE_SCALE_COPY}</p>
    </div>

    <div className="report-practice-card__scale">
      <div className="report-practice-card__scale-labels">
        <span>Lowest intensity</span>
        <span>Highest intensity</span>
      </div>
      <div className="report-practice-card__scale-bar" aria-hidden="true" />
      <div className="report-practice-card__scale-values">
        <span>1</span>
        <span>10</span>
      </div>
    </div>

    <div className="report-practice-card__table" role="table" aria-label={`${group.title} metrics`}>
      <div className="report-practice-card__table-header" role="row">
        <span role="columnheader">Practice</span>
        <span role="columnheader">Fantasy Pull</span>
        <span role="columnheader">Actual Pleasure</span>
      </div>

      <div className="report-practice-card__table-body" role="rowgroup">
        {group.rows.map((row) => (
          <div className="report-practice-card__row" role="row" key={row.practice}>
            <div className="report-practice-card__practice" role="cell">
              <span className="report-practice-card__practice-dot" aria-hidden="true" />
              <span className="report-practice-card__practice-label">{row.practice}</span>
            </div>

            <PracticeMetric label="Fantasy Pull" tone="fantasy" value={row.fantasyPull} />
            <PracticeMetric label="Actual Pleasure" tone="pleasure" value={row.actualPleasure} />
          </div>
        ))}
      </div>
    </div>
  </article>
);

const PracticeTendenciesSection: FC<Props> = ({
  archetype,
  archetypeHtml,
  generalHtml,
  isPremium,
  sectionTitle,
}) => {
  const [unlocked, setUnlocked] = useState(false);
  const introHtml = extractPracticeSectionIntroHtml(generalHtml);
  const groups = parsePracticeTendencyGroups(archetypeHtml);

  return (
    <div className="report-flow report-flow--gap-xl">
      {introHtml ? (
        <div className="report-prose" dangerouslySetInnerHTML={{ __html: introHtml }} />
      ) : null}

      {groups.length > 0 ? (
        <div className="report-themed-block">
          {isPremium && !unlocked ? (
            <div className="report-themed-block__preview report-themed-block__preview--practice">
              <div className="report-practice-grid report-themed-block__blurred" aria-hidden="true">
                {groups.map((group) => (
                  <PracticeCard group={group} key={group.title} />
                ))}
              </div>
              <PremiumOverlay
                archetype={archetype}
                sectionTitle={sectionTitle}
                onUnlock={() => setUnlocked(true)}
              />
            </div>
          ) : (
            <div className="report-practice-grid">
              {groups.map((group) => (
                <PracticeCard group={group} key={group.title} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="report-practice-empty">
          Practice tendencies for this archetype are being prepared.
        </p>
      )}
    </div>
  );
};

export default PracticeTendenciesSection;
