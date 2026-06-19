"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import ChoiceCard from "./ChoiceCard";
import QuestionHeading from "./QuestionHeading";
import { getOptionExplanation } from "./getOptionExplanation";
import { useSurveyTheme } from "../SurveyThemeContext";

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
  const white = useSurveyTheme() === "white";

  return (
    <div className="flex flex-col gap-5">
      {/* Title + subtitle */}
      <QuestionHeading question={question} />

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

export default SingleChoiceQuestion;
