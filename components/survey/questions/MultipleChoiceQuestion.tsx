"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import ChoiceCard from "./ChoiceCard";

interface MultipleChoiceQuestionProps {
  question: SurveyQuestion;
  value: string[] | null;
  onChange: (value: string[]) => void;
  otherText?: string;
  onOtherTextChange?: (text: string) => void;
}

const MultipleChoiceQuestion: FC<MultipleChoiceQuestionProps> = ({
  question,
  value,
  onChange,
  otherText,
  onOtherTextChange,
}) => {
  // Coerce stale localStorage strings (from pre-V6 single→multiple migration) to arrays
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((v) => v !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  // Subtitle from formatGuidance or default
  const subtitle = question.formatGuidance || "Select all that apply";

  return (
    <div className="flex flex-col gap-5">
      {/* Title + subtitle */}
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[31px] font-medium leading-[1.2] text-white break-words sm:text-[39px]">
          {question.question}
        </h2>
        <p className="font-sans text-[15px] font-medium text-[#a78bfa]">
          {subtitle}
          {selected.length > 0 && (
            <span className="ml-2 text-white/40">({selected.length} selected)</span>
          )}
        </p>
      </div>

      {/* Options — single column */}
      <div className="flex flex-col gap-3">
        {question.options.map((option) => (
          <ChoiceCard
            key={option}
            label={option}
            selected={selected.includes(option)}
            onClick={() => toggle(option)}
            multi
          />
        ))}
      </div>

      {/* Other text input */}
      {selected.some((s) => /^other\b/i.test(s)) && (
        <input
          type="text"
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
