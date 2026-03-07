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
  const selected = value ?? [];

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((v) => v !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-sans text-[28px] font-bold leading-tight text-white sm:text-[36px]">
          {question.question}
        </h2>
        <p className="mt-2 font-sans text-[14px] text-white/40">
          Select all that apply
          {selected.length > 0 && (
            <span className="ml-2 text-[#a78bfa]">({selected.length} selected)</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
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

      {selected.some((s) => /^other\b/i.test(s)) && (
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

export default MultipleChoiceQuestion;
