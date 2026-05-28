"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import ChoiceCard from "./ChoiceCard";
import { getOptionExplanation } from "./getOptionExplanation";

interface SingleChoiceQuestionProps {
  question: SurveyQuestion;
  value: string | null;
  onChange: (value: string) => void;
  otherText?: string;
  onOtherTextChange?: (text: string) => void;
}

const SingleChoiceQuestion: FC<SingleChoiceQuestionProps> = ({
  question,
  value,
  onChange,
  otherText,
  onOtherTextChange,
}) => {
  // Subtitle renders only when the canonical data (xlsx `Answer format
  // guidance` column → `question.formatGuidance`) supplies one.
  const subtitle = question.formatGuidance ?? "";

  return (
    <div className="flex flex-col gap-5">
      {/* Title + subtitle */}
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[31px] font-medium leading-[1.2] text-white break-words sm:text-[39px]">
          {question.question}
        </h2>
        {subtitle && <p className="font-sans text-[15px] font-medium text-[#a78bfa]">{subtitle}</p>}
      </div>

      {/* Options — single column */}
      <div className="flex flex-col gap-3">
        {question.options.map((option) => (
          <ChoiceCard
            key={option}
            label={option}
            description={value === option ? getOptionExplanation(question, option) : undefined}
            selected={value === option}
            onClick={() => onChange(option)}
            dimmed={value !== null && value !== option}
          />
        ))}
      </div>

      {/* Other text input */}
      {value && /^other\b/i.test(value) && (
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

export default SingleChoiceQuestion;
