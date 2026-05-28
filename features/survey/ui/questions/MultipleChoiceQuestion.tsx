"use client";

import { useState, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import ChoiceCard from "./ChoiceCard";
import { getOptionExplanation } from "./getOptionExplanation";

interface MultipleChoiceQuestionProps {
  question: SurveyQuestion;
  value: string[] | null;
  onChange: (value: string[]) => void;
  otherText?: string;
  onOtherTextChange?: (text: string) => void;
  forceValidation?: boolean;
}

const MultipleChoiceQuestion: FC<MultipleChoiceQuestionProps> = ({
  question,
  value,
  onChange,
  otherText,
  onOtherTextChange,
  forceValidation = false,
}) => {
  // Coerce stale localStorage strings from the earlier single->multiple migration.
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const [attemptedOverLimit, setAttemptedOverLimit] = useState(false);
  const maxSelections = question.maxSelections;
  const isOverLimit = typeof maxSelections === "number" && selected.length > maxSelections;
  const atLimit = typeof maxSelections === "number" && selected.length >= maxSelections;
  const showLimitMessage =
    typeof maxSelections === "number" &&
    (attemptedOverLimit || isOverLimit || (forceValidation && isOverLimit));

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      setAttemptedOverLimit(false);
      onChange(selected.filter((v) => v !== option));
      return;
    }

    if (typeof maxSelections === "number" && selected.length >= maxSelections) {
      setAttemptedOverLimit(true);
      return;
    }

    setAttemptedOverLimit(false);
    onChange([...selected, option]);
  };

  // Subtitle renders only when the canonical data supplies one.
  const subtitle = question.formatGuidance ?? "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[31px] font-medium leading-[1.2] text-white break-words sm:text-[39px]">
          {question.question}
        </h2>
        {subtitle && <p className="font-sans text-[15px] font-medium text-[#a78bfa]">{subtitle}</p>}
      </div>

      {showLimitMessage && typeof maxSelections === "number" && (
        <p
          role="alert"
          aria-live="polite"
          className="font-sans text-[13px] font-medium text-[#ef4444]"
        >
          You can select up to {maxSelections} options. Deselect one to choose another.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {question.options.map((option) => {
          const isSelected = selected.includes(option);

          return (
            <ChoiceCard
              key={option}
              label={option}
              description={isSelected ? getOptionExplanation(question, option) : undefined}
              selected={isSelected}
              onClick={() => toggle(option)}
              multi
              dimmed={atLimit && !isSelected}
            />
          );
        })}
      </div>

      {selected.some((s) => /^other\b/i.test(s)) && (
        <input
          type="text"
          name={`${question.qId}-other`}
          aria-label={`${question.question} — other`}
          value={otherText ?? ""}
          onChange={(e) => onOtherTextChange?.(e.target.value)}
          placeholder="Please specify…"
          className="w-full border-b-2 border-[rgba(254,104,57,0.2)] bg-transparent pb-3 pt-2 font-sans text-[18px] text-white placeholder:text-white/30 focus:border-[rgba(254,104,57,0.4)] focus:outline-none"
          autoFocus
        />
      )}
    </div>
  );
};

export default MultipleChoiceQuestion;
