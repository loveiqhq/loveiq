"use client";

import type { FC } from "react";

interface Props {
  generalHtml: string;
  importanceLabel: string;
  importanceValue: number | null;
}

function describeImportance(value: number | null) {
  if (value === null) {
    return "We do not have enough signal yet to place how central sexuality feels in your life right now.";
  }
  if (value <= 2) {
    return "Sex is not the main organizing force right now and tends to matter more in specific contexts than as a constant priority.";
  }
  if (value <= 5) {
    return "Sex matters, but it shares space with other emotional and relational priorities and depends heavily on context.";
  }
  return "Sex feels central to vitality, identity, and connection, and it carries real weight in overall relationship satisfaction.";
}

function stripResultParagraph(html: string) {
  return html.replace(/<p><strong>Your result:\s*<\/strong>.*?<\/p>/i, "").trim();
}

const ImportanceOfSexualitySection: FC<Props> = ({
  generalHtml,
  importanceLabel,
  importanceValue,
}) => (
  <div className="space-y-10">
    <article className="report-card report-importance-card">
      <p className="report-hero-card__pill">Your result</p>
      <div className="report-importance-card__value-wrap">
        <p className="report-importance-card__value">{importanceLabel || "Still calibrating"}</p>
        {importanceValue !== null ? (
          <p className="report-importance-card__score">
            <span>{importanceValue}</span>
            <small>/7</small>
          </p>
        ) : null}
      </div>
      <p className="report-importance-card__copy">{describeImportance(importanceValue)}</p>
    </article>

    <div
      className="report-prose"
      dangerouslySetInnerHTML={{ __html: stripResultParagraph(generalHtml) }}
    />
  </div>
);

export default ImportanceOfSexualitySection;
