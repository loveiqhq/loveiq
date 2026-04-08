"use client";

import type { FC } from "react";

interface Props {
  generalHtml: string;
  importanceLabel: string;
  importanceValue: number | null;
}

const CHART_HEIGHT = 260;
const ACCENT = "#6faed9";

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

/** Map 1-7 value to bar height as percentage of chart */
function valueToHeight(v: number): number {
  return Math.round(((v - 1) / 6) * 85 + 15);
}

/** Reference bars: fixed archetypes at typical levels */
const REF_BARS = [
  { value: 2, label: "Low ref" },
  { value: 3.5, label: "Low-mid ref" },
];
const HIGH_BAR = { value: 6.5, label: "High ref" };

function stripResultParagraph(html: string) {
  return html.replace(/<p><strong>Your result:\s*<\/strong>.*?<\/p>/i, "").trim();
}

const ImportanceOfSexualitySection: FC<Props> = ({
  generalHtml,
  importanceLabel,
  importanceValue,
}) => {
  const band = getBand(importanceValue);
  const userHeight = importanceValue !== null ? valueToHeight(importanceValue) : 0;

  return (
    <div className="space-y-10">
      <article className="report-importance">
        {/* Top highlight line */}
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
          {/* Y-axis */}
          <div className="report-importance__yaxis">
            <span>High</span>
            <span>Medium</span>
            <span>Low</span>
          </div>

          {/* Chart area */}
          <div className="report-importance__bars">
            {/* Grid lines */}
            <div className="report-importance__grid">
              <div className="report-importance__gridline report-importance__gridline--dashed" />
              <div className="report-importance__gridline report-importance__gridline--faint" />
              <div className="report-importance__gridline report-importance__gridline--faint" />
            </div>

            {/* Bars */}
            {REF_BARS.map((bar, i) => (
              <div key={i} className="report-importance__bar">
                <div
                  className="report-importance__bar-fill report-importance__bar-fill--ref"
                  style={{ height: `${valueToHeight(bar.value)}%` }}
                />
              </div>
            ))}

            {/* User bar */}
            <div className="report-importance__bar">
              <div className="report-importance__tooltip">You</div>
              <div
                className="report-importance__bar-fill report-importance__bar-fill--user"
                style={{ height: `${userHeight}%` }}
              />
            </div>

            {/* High reference bar */}
            <div className="report-importance__bar">
              <div
                className="report-importance__bar-fill report-importance__bar-fill--ref report-importance__bar-fill--tall"
                style={{ height: `${valueToHeight(HIGH_BAR.value)}%` }}
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
