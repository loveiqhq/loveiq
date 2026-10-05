"use client";

import type { CSSProperties, FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import QuestionHeading from "./QuestionHeading";

interface ScaleQuestionProps {
  question: SurveyQuestion;
  value: number | null;
  onChange: (value: number) => void;
}

/**
 * Ring diameters in px. They shrink toward the neutral middle and grow toward both
 * ends, so the scale reads stronger at either pole. From 640px: Figma 11303:174.
 * Phones: the landing page's own scale (Figma 9200:32861, WQuestionCard), so the
 * question asked there looks the same here. The tap target is the whole column.
 */
const RING_PX = [46, 38, 31, 27, 31, 38, 46] as const;
const PHONE_RING_PX = [34, 29, 24, 21, 24, 29, 34] as const;

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
  const selectedLabel = value !== null ? getValueLabel(value, question) : "";
  const selectedExplanation = value !== null ? getValueExplanation(value, question) : null;

  return (
    <div className="flex flex-col gap-5">
      <QuestionHeading question={question} />

      <div className="flex flex-col gap-[13.6px] pt-[4.8px]">
        {/* Rings, one per equal column, on a hairline running centre to centre */}
        {/* data-no-swipe: a drag across the rings is not a swipe to the next question. */}
        <div className="relative flex h-12 items-center" data-no-swipe>
          <div
            aria-hidden
            className="pointer-events-none absolute left-[calc(100%/14)] right-[calc(100%/14)] top-1/2 h-px -translate-y-1/2 bg-[rgba(22,16,33,0.09)]"
          >
            <div
              className="h-full bg-[#6b5b95] transition-[width] duration-300 ease-out"
              style={{ width: value ? `${((value - 1) / 6) * 100}%` : "0%" }}
            />
          </div>

          {RING_PX.map((ring, i) => {
            const v = i + 1;
            const isSelected = v === value;
            const isLit = value !== null && v <= value;

            return (
              <button
                key={v}
                type="button"
                aria-label={`${v} of 7`}
                aria-pressed={isSelected}
                onClick={() => onChange(v)}
                className="group relative z-10 flex h-12 flex-1 cursor-pointer items-center justify-center focus-visible:outline-none"
                style={
                  { "--ring": `${ring}px`, "--ring-sm": `${PHONE_RING_PX[i]}px` } as CSSProperties
                }
              >
                <span
                  className={`flex size-[var(--ring-sm)] items-center justify-center rounded-full border-2 bg-white transition-[border-color,box-shadow] duration-300 ease-out group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-[6px] group-focus-visible:outline-[#6b5b95] sm:size-[var(--ring)] ${
                    isLit
                      ? "border-[#6b5b95]"
                      : "border-[rgba(22,16,33,0.16)] group-hover:border-[rgba(107,91,149,0.55)]"
                  } ${
                    isSelected
                      ? "shadow-[0_0_0_4px_rgba(107,91,149,0.35),0_0_26px_rgba(107,91,149,0.45)]"
                      : ""
                  }`}
                >
                  <span
                    className={`rounded-full bg-[#6b5b95] transition-[width,height] duration-300 ease-out ${
                      isSelected
                        ? "size-[calc(var(--ring-sm)*0.38)] sm:size-[calc(var(--ring)*0.38)]"
                        : "size-[calc(var(--ring-sm)*0.32)] sm:size-[calc(var(--ring)*0.32)]"
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>

        {/* End labels — only when the canonical data supplies them, never a fallback */}
        {(question.scaleLabels?.low || question.scaleLabels?.high) && (
          <div className="flex items-start justify-between gap-4 font-sans text-[12.5px] font-extrabold leading-[18px]">
            <span className="max-w-[45%] text-[#4a4458]">{question.scaleLabels?.low ?? ""}</span>
            <span className="max-w-[45%] text-right text-[#6b5b95]">
              {question.scaleLabels?.high ?? ""}
            </span>
          </div>
        )}

        {/* What the picked point means — absent until something is picked */}
        {(selectedLabel || selectedExplanation) && (
          <div className="flex flex-col gap-[2.4px]" aria-live="polite">
            {selectedLabel && (
              <p className="text-center font-serif text-[17px] font-semibold leading-[21.25px] text-[#161021]">
                {selectedLabel}
              </p>
            )}
            {selectedExplanation && (
              <p className="font-sans text-[13.5px] leading-[19.6px] text-[#4a4458]">
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
