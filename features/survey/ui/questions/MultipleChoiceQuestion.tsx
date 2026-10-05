"use client";

import { useState, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import ChoiceCard from "./ChoiceCard";
import QuestionHeading from "./QuestionHeading";
import { getOptionExplanation } from "./getOptionExplanation";
import { useOrderedOptions } from "./useOrderedOptions";
import { useSurveyTheme } from "../SurveyThemeContext";

/** An answer that means "none of the above". */
export const isExclusive = (option: string) => /^none of these\b/i.test(option);

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

    // "None of these" and any other pick exclude each other: both together was a
    // contradiction the survey stored.
    if (isExclusive(option)) {
      setAttemptedOverLimit(false);
      onChange([option]);
      return;
    }
    const others = selected.filter((v) => !isExclusive(v));

    if (typeof maxSelections === "number" && others.length >= maxSelections) {
      setAttemptedOverLimit(true);
      return;
    }

    setAttemptedOverLimit(false);
    onChange([...others, option]);
  };

  const white = useSurveyTheme() === "white";
  const options = useOrderedOptions(question);

  return (
    <div className="flex flex-col gap-5">
      <QuestionHeading question={question} />

      {showLimitMessage && typeof maxSelections === "number" && (
        <p
          role="alert"
          aria-live="polite"
          className="font-sans text-[13px] font-medium text-[#ef4444]"
        >
          You can select up to {maxSelections} {maxSelections === 1 ? "option" : "options"}.
          Deselect one to choose another.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {options.map((option) => {
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
          // The server keeps 1000 characters; more was refused at the final submit.
          maxLength={500}
          className={`w-full border-b-2 border-[rgba(254,104,57,0.2)] bg-transparent pb-3 pt-2 font-sans text-[18px] focus:border-[rgba(254,104,57,0.4)] focus:outline-none ${
            white
              ? "text-[#161021] placeholder:text-black/30"
              : "text-white placeholder:text-white/30"
          }`}
          autoFocus
        />
      )}
    </div>
  );
};

export default MultipleChoiceQuestion;
