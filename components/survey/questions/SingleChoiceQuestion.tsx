"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import ChoiceCard from "./ChoiceCard";

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
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-sans text-[28px] font-bold leading-tight text-white sm:text-[36px]">
        {question.question}
      </h2>

      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        {question.options.map((option) => (
          <ChoiceCard
            key={option}
            label={option}
            selected={value === option}
            onClick={() => onChange(option)}
          />
        ))}
      </div>

      {value && /^other\b/i.test(value) && (
        <input
          type="text"
          value={otherText ?? ""}
          onChange={(e) => onOtherTextChange?.(e.target.value)}
          placeholder="Please specify…"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-sans text-[15px] text-white placeholder:text-white/30 focus:border-[#a78bfa] focus:outline-none"
          autoFocus
        />
      )}
    </div>
  );
};

export default SingleChoiceQuestion;
