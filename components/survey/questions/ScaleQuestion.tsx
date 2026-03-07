"use client";

import { type FC, useCallback } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

interface ScaleQuestionProps {
  question: SurveyQuestion;
  value: number | null;
  onChange: (value: number) => void;
}

const AGREE_LABELS: Record<number, string> = {
  1: "Strongly Disagree",
  2: "Disagree",
  3: "Somewhat Disagree",
  4: "Neutral / Mixed",
  5: "Somewhat Agree",
  6: "Agree",
  7: "Strongly Agree",
};

const INTENSITY_LABELS: Record<number, string> = {
  1: "Not at all",
  2: "Slightly",
  3: "Somewhat",
  4: "Moderately",
  5: "Considerably",
  6: "Very",
  7: "Extremely",
};

function getValueLabel(value: number, scaleLabels?: { low: string; high: string }): string {
  if (!scaleLabels) return AGREE_LABELS[value] || "";
  // If low label contains "not at all" or similar intensity words, use intensity labels
  const low = scaleLabels.low.toLowerCase();
  if (low.includes("not at all") || low.includes("not important") || low.includes("not possible")) {
    return INTENSITY_LABELS[value] || "";
  }
  // For satisfaction/agreement scales, use agree labels
  if (low.includes("disagree") || low.includes("dissatisfied")) {
    return AGREE_LABELS[value] || "";
  }
  // For custom scales (like calm→intense), interpolate
  return AGREE_LABELS[value] || "";
}

const ScaleQuestion: FC<ScaleQuestionProps> = ({ question, value, onChange }) => {
  const handleDotClick = useCallback(
    (v: number) => {
      onChange(v);
    },
    [onChange]
  );

  const selectedLabel = value ? getValueLabel(value, question.scaleLabels) : null;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-serif text-[28px] font-bold leading-tight text-white sm:text-[36px]">
        {question.question}
      </h2>

      {/* Selected value label */}
      {selectedLabel && (
        <div className="flex flex-col items-center gap-2">
          <span className="font-sans text-[18px] font-medium text-white/70 sm:text-[20px]">
            {selectedLabel}
          </span>
          <span className="rounded-full border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.1)] px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-[#a78bfa]">
            Level {value} of 7
          </span>
        </div>
      )}

      {/* Dot scale */}
      <div className="flex flex-col gap-3 py-4">
        <div className="relative flex items-center justify-between px-1">
          {/* Track line behind dots */}
          <div className="absolute left-[24px] right-[24px] top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-white/10 sm:left-[28px] sm:right-[28px]">
            {value && (
              <div
                className="h-full rounded-full bg-[#a78bfa] transition-all duration-300 ease-out"
                style={{ width: `${((value - 1) / 6) * 100}%` }}
              />
            )}
          </div>

          {/* Dots — all same outer size to prevent layout shift */}
          {[1, 2, 3, 4, 5, 6, 7].map((v) => {
            const isSelected = v === value;
            const isBefore = value !== null && v < value;

            return (
              <button
                key={v}
                type="button"
                aria-label={`${v} of 7`}
                onClick={() => handleDotClick(v)}
                className="relative z-10 flex h-[48px] w-[48px] shrink-0 items-center justify-center sm:h-[52px] sm:w-[52px]"
              >
                <span
                  className={`flex items-center justify-center rounded-full transition-all duration-200 ${
                    isSelected
                      ? "h-[48px] w-[48px] border-2 border-[rgba(167,139,250,0.7)] bg-[#1a0b2e] shadow-[0_0_16px_rgba(167,139,250,0.4)] sm:h-[52px] sm:w-[52px]"
                      : isBefore
                        ? "h-[40px] w-[40px] border-2 border-[rgba(167,139,250,0.5)] bg-[#1a0b2e]"
                        : "h-[40px] w-[40px] border-2 border-white/10 bg-[#0a0510] hover:border-white/20"
                  }`}
                >
                  <span
                    className={`rounded-full transition-all duration-200 ${
                      isSelected
                        ? "h-3 w-3 bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                        : isBefore
                          ? "h-2 w-2 bg-[#a78bfa]"
                          : "h-2 w-2 bg-white/20"
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>

        {/* Scale labels */}
        <div className="flex justify-between px-1">
          <span className="max-w-[100px] font-sans text-[11px] font-medium uppercase tracking-wider text-white/40 sm:text-[12px]">
            {question.scaleLabels?.low || "Strongly Disagree"}
          </span>
          <span className="max-w-[100px] text-right font-sans text-[11px] font-medium uppercase tracking-wider text-white/40 sm:text-[12px]">
            {question.scaleLabels?.high || "Strongly Agree"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ScaleQuestion;
