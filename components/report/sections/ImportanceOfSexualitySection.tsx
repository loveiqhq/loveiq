"use client";

import type { FC } from "react";

interface Props {
  generalHtml: string;
  importanceLabel: string;
  importanceValue: number | null;
}

function getBand(value: number | null): { label: string; description: string } {
  if (value === null) return { label: "—", description: "" };
  if (value <= 2)
    return {
      label: "Low",
      description:
        "Sex is <strong>not the main organizing force</strong> right now and tends to matter more in specific contexts than as a constant priority.",
    };
  if (value <= 5)
    return {
      label: "Medium",
      description:
        "Sex is a <strong>meaningful part</strong> of your identity among many other parts.",
    };
  return {
    label: "High",
    description:
      "Sex feels <strong>central to vitality, identity, and connection</strong>, and it carries real weight in overall life satisfaction.",
  };
}

/**
 * Map 1-7 value to bar height percentage of the chart.
 * Low zone: 1→12%, 2→25%
 * Medium zone: 3→40%, 4→52%, 5→65%
 * High zone: 6→78%, 7→92%
 */
function valueToHeight(v: number): number {
  return Math.round(((v - 1) / 6) * 80 + 12);
}

function stripResultParagraph(html: string) {
  return html.replace(/<p><strong>Your result:\s*<\/strong>.*?<\/p>/i, "").trim();
}

/**
 * Fixed chart bars:
 * Position 0: Low reference (always short)
 * Position 1: Low-medium reference
 * Position 2: User bar (colored, with tooltip)
 * Position 3: High reference (always tall)
 *
 * If user is Low, their bar is short and clearly in the low zone.
 * If user is Medium, bar is mid-height.
 * If user is High, bar is tall.
 */
const ImportanceOfSexualitySection: FC<Props> = ({
  generalHtml,
  importanceLabel,
  importanceValue,
}) => {
  const band = getBand(importanceValue);
  const userValue = importanceValue ?? 4;
  const userHeight = valueToHeight(userValue);

  return (
    <div className="space-y-10">
      <article className="report-importance">
        <div className="report-importance__highlight" aria-hidden="true" />

        {/* Header */}
        <div className="report-importance__header">
          <div className="report-importance__overline">
            <span className="report-importance__overline-line" />
            <span>Your Result</span>
          </div>

          <div className="report-importance__result">
            <p className="report-importance__band">{band.label}</p>
            <span className="report-importance__divider" aria-hidden="true" />
            <p
              className="report-importance__desc"
              dangerouslySetInnerHTML={{ __html: band.description }}
            />
          </div>
        </div>

        {/* Bar chart */}
        <div className="report-importance__chart">
          <div className="report-importance__yaxis">
            <span>High</span>
            <span>Medium</span>
            <span>Low</span>
          </div>

          <div className="report-importance__bars">
            <div className="report-importance__grid">
              <div className="report-importance__gridline report-importance__gridline--dashed" />
              <div className="report-importance__gridline report-importance__gridline--faint" />
              <div className="report-importance__gridline report-importance__gridline--faint" />
            </div>

            {/* Bar 1: Low reference */}
            <div className="report-importance__bar">
              <div
                className="report-importance__bar-fill report-importance__bar-fill--ref"
                style={{ height: `${valueToHeight(1.5)}%` }}
              />
            </div>

            {/* Bar 2: Low-medium reference */}
            <div className="report-importance__bar">
              <div
                className="report-importance__bar-fill report-importance__bar-fill--ref"
                style={{ height: `${valueToHeight(3.5)}%` }}
              />
            </div>

            {/* Bar 3: USER — always in position 3 with tooltip */}
            <div className="report-importance__bar">
              <div
                className="report-importance__bar-fill report-importance__bar-fill--user"
                style={{ height: `${userHeight}%` }}
              >
                <div className="report-importance__tooltip">You</div>
              </div>
            </div>

            {/* Bar 4: High reference */}
            <div className="report-importance__bar">
              <div
                className="report-importance__bar-fill report-importance__bar-fill--ref report-importance__bar-fill--tall"
                style={{ height: `${valueToHeight(6.5)}%` }}
              />
            </div>
          </div>
        </div>
      </article>

      <div
        className="report-prose"
        dangerouslySetInnerHTML={{ __html: stripResultParagraph(generalHtml) }}
      />
    </div>
  );
};

export default ImportanceOfSexualitySection;
