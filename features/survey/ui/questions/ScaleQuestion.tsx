"use client";

import { type FC, useCallback, useState } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import QuestionHeading from "./QuestionHeading";
import { useSurveyTheme } from "../SurveyThemeContext";

interface ScaleQuestionProps {
  question: SurveyQuestion;
  value: number | null;
  onChange: (value: number) => void;
}

function splitHoverState(raw: string): { title: string; description: string | null } {
  const colonIndex = raw.indexOf(":");
  if (colonIndex === -1) return { title: raw, description: null };
  const title = raw.slice(0, colonIndex).trim();
  const description = raw.slice(colonIndex + 1).trim();
  return { title, description: description.length > 0 ? description : null };
}

function getValueLabel(value: number, question: SurveyQuestion): string {
  if (question.hoverStates && question.hoverStates[value]) {
    return splitHoverState(question.hoverStates[value]).title;
  }
  return "";
}

function getValueExplanation(value: number, question: SurveyQuestion): string | null {
  const entry = question.answerOptionsExplained?.[value - 1];
  if (entry?.explanation) return entry.explanation;
  if (question.hoverStates && question.hoverStates[value]) {
    return splitHoverState(question.hoverStates[value]).description;
  }
  return null;
}

const ScaleQuestion: FC<ScaleQuestionProps> = ({ question, value, onChange }) => {
  const white = useSurveyTheme() === "white";
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);

  const handleDotClick = useCallback(
    (v: number) => {
      onChange(v);
    },
    [onChange]
  );

  const displayValue = value;
  const selectedExplanation = displayValue ? getValueExplanation(displayValue, question) : null;
  const selectedLabel = displayValue !== null ? getValueLabel(displayValue, question) : "";

  return (
    <div className="flex flex-col gap-6">
      {/* Title + subtitle */}
      <QuestionHeading question={question} />

      {/* Dot scale */}
      <div className="flex flex-col gap-3 py-2">
        <div className="relative flex items-center justify-between px-1">
          {/* Track line behind dots */}
          <div
            className={`absolute left-[20px] right-[20px] top-1/2 h-[3px] -translate-y-1/2 rounded-full sm:left-[24px] sm:right-[24px] ${
              white ? "bg-black/[0.08]" : "bg-white/[0.08]"
            }`}
          >
            {value && (
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  white ? "bg-[#8b6fbf]" : "bg-[#a78bfa]"
                }`}
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
                    white
                      ? isSelected
                        ? "h-[44px] w-[44px] border-2 border-[#8b6fbf] bg-[#f1ecfb] shadow-[0_0_15px_rgba(139,111,191,0.25)] sm:h-[53px] sm:w-[53px]"
                        : isBefore
                          ? "h-[40px] w-[40px] border-2 border-[#8b6fbf] bg-[#f1ecfb] shadow-[0_0_15px_rgba(139,111,191,0.25)]"
                          : isHoverTarget
                            ? "h-[44px] w-[44px] border-2 border-[rgba(139,111,191,0.55)] bg-[rgba(241,236,251,0.85)] shadow-[0_0_18px_rgba(139,111,191,0.2)] sm:h-[53px] sm:w-[53px]"
                            : isHoverFill
                              ? "h-[40px] w-[40px] border-2 border-[rgba(139,111,191,0.35)] bg-[rgba(241,236,251,0.65)] shadow-[0_0_10px_rgba(139,111,191,0.1)]"
                              : "h-[40px] w-[40px] border-2 border-black/15 bg-white hover:border-black/25"
                      : isSelected
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
                      white
                        ? isSelected
                          ? "bg-[#8b6fbf] shadow-[0_0_10px_rgba(139,111,191,0.5)]"
                          : isBefore
                            ? "bg-[#8b6fbf] opacity-40"
                            : isHoverTarget
                              ? "scale-[1.3] bg-[#8b6fbf] opacity-50"
                              : isHoverFill
                                ? "scale-[1.1] bg-[#8b6fbf] opacity-25"
                                : "h-2 w-2 bg-black/20"
                        : isSelected
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

        {/* Scale endpoint labels — only rendered when the canonical data
            (xlsx `1-7 Explanations` levels 1 and 7) supplies them. No
            hardcoded fallback so we never show copy that isn't in the data. */}
        {(question.scaleLabels?.low || question.scaleLabels?.high) && (
          <div className="flex justify-between gap-4 px-1">
            <span
              className={`max-w-[150px] font-sans text-[15px] font-bold leading-[20px] capitalize sm:max-w-[180px] sm:text-[16px] sm:leading-[21.138px] ${
                white ? "text-[#161021]" : "text-white"
              }`}
            >
              {question.scaleLabels?.low ?? ""}
            </span>
            <span
              className={`max-w-[150px] text-right font-sans text-[15px] font-bold leading-[20px] capitalize sm:max-w-[180px] sm:text-[16px] sm:leading-[21.138px] ${
                white ? "text-[#6b5b95]" : "text-[#a78bfa]"
              }`}
            >
              {question.scaleLabels?.high ?? ""}
            </span>
          </div>
        )}

        {/* Selected label + explanation — only rendered after the user picks a value,
             so the dots sit flush under the title before any click.
             Rendered last (below the dots) on both mobile and desktop. */}
        {displayValue !== null && (
          <div className="flex flex-col items-center gap-2 pt-2 text-center">
            <span
              className={`font-sans text-[24px] font-bold leading-tight tracking-[0.5px] sm:text-[32px] sm:font-medium sm:tracking-[0.6px] ${
                white ? "text-[#161021]" : "text-white/90"
              }`}
            >
              {selectedLabel}
            </span>
            {selectedExplanation && (
              <p
                className={`font-sans text-[14px] leading-snug sm:text-[20px] sm:font-light sm:lowercase ${
                  white ? "text-[#6b6678] sm:text-[#6b6678]" : "text-white/70 sm:text-white/80"
                }`}
              >
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
