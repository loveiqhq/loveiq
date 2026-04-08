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
 * Map 1-7 value to bar height percentage.
 * 1 → 10%, 4 → 50%, 7 → 92%
 */
function valueToHeight(v: number): number {
  return Math.round(((v - 1) / 6) * 82 + 10);
}

/** Fixed reference bars at known positions */
const BARS = [
  { value: 1.8, isUser: false },
  { value: 3.2, isUser: false },
  // User bar is inserted dynamically
  { value: 6.5, isUser: false },
];

function stripResultParagraph(html: string) {
  return html.replace(/<p><strong>Your result:\s*<\/strong>.*?<\/p>/i, "").trim();
}

const ImportanceOfSexualitySection: FC<Props> = ({
  generalHtml,
  importanceLabel,
  importanceValue,
}) => {
  const band = getBand(importanceValue);
  const userValue = importanceValue ?? 4;

  // Build bar list: insert user bar in sorted position among reference bars
  const allBars = [...BARS, { value: userValue, isUser: true }].sort((a, b) => a.value - b.value);

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

            {allBars.map((bar, i) => (
              <div key={i} className="report-importance__bar">
                {bar.isUser && <div className="report-importance__tooltip">You</div>}
                <div
                  className={`report-importance__bar-fill ${bar.isUser ? "report-importance__bar-fill--user" : "report-importance__bar-fill--ref"}`}
                  style={{ height: `${valueToHeight(bar.value)}%` }}
                />
              </div>
            ))}
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
