"use client";

import { type FC, useCallback } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

interface ScaleQuestionProps {
  question: SurveyQuestion;
  value: number | null;
  onChange: (value: number) => void;
}

const FALLBACK_LABELS: Record<number, string> = {
  1: "Strongly Disagree",
  2: "Disagree",
  3: "Somewhat Disagree",
  4: "Neutral / Mixed",
  5: "Somewhat Agree",
  6: "Agree",
  7: "Strongly Agree",
};

function getValueLabel(value: number, question: SurveyQuestion): string {
  if (question.hoverStates && question.hoverStates[value]) {
    return question.hoverStates[value];
  }
  return FALLBACK_LABELS[value] || "";
}

const ScaleQuestion: FC<ScaleQuestionProps> = ({ question, value, onChange }) => {
  const handleDotClick = useCallback(
    (v: number) => {
      onChange(v);
    },
    [onChange]
  );

  const selectedLabel = value ? getValueLabel(value, question) : null;

  // Subtitle from formatGuidance or construct from scale labels
  const subtitle =
    question.formatGuidance ||
    (question.scaleLabels
      ? `Rate from 1 (${question.scaleLabels.low.toLowerCase()}) to 7 (${question.scaleLabels.high.toLowerCase()})`
      : "Rate on a scale of 1 to 7");

  return (
    <div className="flex flex-col gap-6">
      {/* Title + subtitle */}
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[31px] font-medium leading-[1.2] text-white sm:text-[39px]">
          {question.question}
        </h2>
        <p className="font-sans text-[15px] font-medium text-[#a78bfa]">{subtitle}</p>
      </div>

      {/* Selected value display OR awaiting selection */}
      <div className="flex flex-col items-center gap-2 py-2">
        {selectedLabel ? (
          <>
            <span className="font-sans text-[18px] font-medium text-white/70 sm:text-[20px]">
              {selectedLabel}
            </span>
            <span className="rounded-full border border-[rgba(167,139,250,0.25)] bg-[rgba(167,139,250,0.1)] px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-[#a78bfa]">
              Level {value} of 7
            </span>
          </>
        ) : (
          <span className="font-sans text-[16px] font-medium text-white/30">
            Awaiting selection
          </span>
        )}
      </div>

      {/* Dot scale */}
      <div className="flex flex-col gap-3 py-2">
        <div className="relative flex items-center justify-between px-1">
          {/* Track line behind dots */}
          <div className="absolute left-[20px] right-[20px] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/[0.08] sm:left-[24px] sm:right-[24px]">
            {value && (
              <div
                className="h-full rounded-full bg-[#a78bfa] transition-all duration-300 ease-out"
                style={{ width: `${((value - 1) / 6) * 100}%` }}
              />
            )}
          </div>

          {/* Dots */}
          {[1, 2, 3, 4, 5, 6, 7].map((v) => {
            const isSelected = v === value;
            const isBefore = value !== null && v < value;

            return (
              <button
                key={v}
                type="button"
                aria-label={`${v} of 7`}
                onClick={() => handleDotClick(v)}
                className="relative z-10 flex h-[40px] w-[40px] shrink-0 items-center justify-center sm:h-[48px] sm:w-[48px]"
              >
                <span
                  className={`flex shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                    isSelected
                      ? "h-[44px] w-[44px] border-2 border-[#a78bfa] bg-[#1a0b2e] shadow-[0_0_15px_rgba(167,139,250,0.3)] sm:h-[53px] sm:w-[53px]"
                      : isBefore
                        ? "h-[40px] w-[40px] border-2 border-[#a78bfa] bg-[#1a0b2e] shadow-[0_0_15px_rgba(167,139,250,0.3)]"
                        : "h-[40px] w-[40px] border-2 border-white/10 bg-[#0a0510] hover:border-white/20"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full transition-all duration-200 sm:h-3 sm:w-3 ${
                      isSelected
                        ? "bg-white shadow-[0_0_10px_white]"
                        : isBefore
                          ? "bg-[#a78bfa] opacity-40"
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
          <span className="max-w-[120px] font-sans text-[11px] font-medium uppercase tracking-wider text-white/35 sm:text-[12px]">
            {question.scaleLabels?.low || "Strongly Disagree"}
          </span>
          <span className="max-w-[120px] text-right font-sans text-[11px] font-medium uppercase tracking-wider text-white/35 sm:text-[12px]">
            {question.scaleLabels?.high || "Strongly Agree"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ScaleQuestion;
