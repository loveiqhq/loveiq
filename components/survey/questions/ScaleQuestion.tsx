"use client";

import { type FC, useCallback, useState } from "react";
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

function getValueExplanation(value: number, question: SurveyQuestion): string | null {
  const entry = question.answerOptionsExplained?.[value - 1];
  return entry?.explanation ?? null;
}

const ScaleQuestion: FC<ScaleQuestionProps> = ({ question, value, onChange }) => {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);

  const handleDotClick = useCallback(
    (v: number) => {
      onChange(v);
    },
    [onChange]
  );

  const activeValue = value ?? hoveredValue;
  const displayValue = value;
  const selectedExplanation = displayValue ? getValueExplanation(displayValue, question) : null;

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
        <h2 className="font-serif text-[31px] font-medium leading-[1.2] text-white break-words sm:text-[39px]">
          {question.question}
        </h2>
        <p className="font-sans text-[15px] font-medium text-[#a78bfa]">{subtitle}</p>
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
            {hoveredValue !== null && hoveredValue > (value ?? 0) && (
              <div
                className="absolute h-full rounded-full transition-[left,width]"
                style={{
                  left: value ? `${((value - 1) / 6) * 100}%` : "0%",
                  width: `${((hoveredValue - (value ?? 1)) / 6) * 100}%`,
                  transitionDuration: "320ms",
                  transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                  background:
                    "linear-gradient(90deg, rgba(167,139,250,0.35), rgba(167,139,250,0.15))",
                }}
              />
            )}
          </div>

          {/* Dots */}
          {[1, 2, 3, 4, 5, 6, 7].map((v) => {
            const isSelected = v === value;
            const isBefore = value !== null && v < value;
            const isHoverFill =
              !isSelected && !isBefore && hoveredValue !== null && v <= hoveredValue;
            const isHoverTarget =
              hoveredValue !== null && v === hoveredValue && !isSelected && !isBefore;

            return (
              <button
                key={v}
                type="button"
                aria-label={`${v} of 7`}
                onClick={() => handleDotClick(v)}
                onMouseEnter={() => setHoveredValue(v)}
                onMouseLeave={() => setHoveredValue(null)}
                className="relative z-10 flex h-[40px] w-[40px] shrink-0 items-center justify-center sm:h-[48px] sm:w-[48px]"
              >
                <span
                  className={`flex shrink-0 items-center justify-center rounded-full transition-[border-color,background-color,box-shadow,width,height] ${
                    isSelected
                      ? "h-[44px] w-[44px] border-2 border-[#a78bfa] bg-[#1a0b2e] shadow-[0_0_15px_rgba(167,139,250,0.3)] sm:h-[53px] sm:w-[53px]"
                      : isBefore
                        ? "h-[40px] w-[40px] border-2 border-[#a78bfa] bg-[#1a0b2e] shadow-[0_0_15px_rgba(167,139,250,0.3)]"
                        : isHoverTarget
                          ? "h-[44px] w-[44px] border-2 border-[rgba(167,139,250,0.55)] bg-[rgba(26,11,46,0.7)] shadow-[0_0_18px_rgba(167,139,250,0.25)] sm:h-[53px] sm:w-[53px]"
                          : isHoverFill
                            ? "h-[40px] w-[40px] border-2 border-[rgba(167,139,250,0.35)] bg-[rgba(26,11,46,0.45)] shadow-[0_0_10px_rgba(167,139,250,0.12)]"
                            : "h-[40px] w-[40px] border-2 border-white/10 bg-[#0a0510] hover:border-white/20"
                  }`}
                  style={{
                    transitionDuration: "280ms",
                    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                    transitionDelay:
                      isHoverFill || isHoverTarget || isSelected || isBefore
                        ? `${(v - 1) * 20}ms`
                        : `${(7 - v) * 20}ms`,
                  }}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full transition-[background-color,opacity,transform] sm:h-3 sm:w-3 ${
                      isSelected
                        ? "bg-white shadow-[0_0_10px_white]"
                        : isBefore
                          ? "bg-[#a78bfa] opacity-40"
                          : isHoverTarget
                            ? "scale-[1.3] bg-[#a78bfa] opacity-50"
                            : isHoverFill
                              ? "scale-[1.1] bg-[#a78bfa] opacity-25"
                              : "h-2 w-2 bg-white/20"
                    }`}
                    style={{
                      transitionDuration: isHoverTarget ? "300ms" : "280ms",
                      transitionTimingFunction: isHoverTarget
                        ? "cubic-bezier(0.34, 1.56, 0.64, 1)"
                        : "cubic-bezier(0.16, 1, 0.3, 1)",
                      transitionDelay:
                        isHoverFill || isHoverTarget || isSelected || isBefore
                          ? `${(v - 1) * 20 + 40}ms`
                          : `${(7 - v) * 20}ms`,
                    }}
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

        {/* Selected label + explanation (below scale) */}
        {displayValue !== null && (
          <div className="flex flex-col items-center gap-1 pt-2">
            <span className="font-sans text-[18px] font-medium text-white/70 sm:text-[20px]">
              {getValueLabel(displayValue, question)}
            </span>
            {selectedExplanation && (
              <p className="text-center font-sans text-[14px] leading-relaxed text-white/50 sm:text-[15px]">
                {selectedExplanation}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScaleQuestion;
