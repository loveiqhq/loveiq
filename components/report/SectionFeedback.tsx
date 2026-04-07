"use client";

import type { FC } from "react";

interface Props {
  onFeedback: (feedback: "up" | "down") => void;
  sectionTitle: string;
  value: "up" | "down" | null;
}

const ThumbUp: FC<{ active: boolean }> = ({ active }) => (
  <svg
    aria-hidden="true"
    className={`report-feedback__icon ${active ? "is-active" : ""}`}
    viewBox="0 0 24 24"
    fill={active ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </svg>
);

const ThumbDown: FC<{ active: boolean }> = ({ active }) => (
  <svg
    aria-hidden="true"
    className={`report-feedback__icon ${active ? "is-active" : ""}`}
    viewBox="0 0 24 24"
    fill={active ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 14V2" />
    <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
  </svg>
);

const SectionFeedback: FC<Props> = ({ onFeedback, sectionTitle, value }) => (
  <div className="report-feedback">
    <span className="report-feedback__label">Does this resonate?</span>
    <div className="report-feedback__controls">
      <button
        type="button"
        aria-label={`This section resonates: ${sectionTitle}`}
        className={`report-feedback__button ${value === "up" ? "is-selected" : ""}`}
        onClick={() => onFeedback("up")}
      >
        <ThumbUp active={value === "up"} />
      </button>
      <button
        type="button"
        aria-label={`This section does not resonate: ${sectionTitle}`}
        className={`report-feedback__button ${value === "down" ? "is-selected" : ""}`}
        onClick={() => onFeedback("down")}
      >
        <ThumbDown active={value === "down"} />
      </button>
    </div>
  </div>
);

export default SectionFeedback;
