"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

interface OpenResponseQuestionProps {
  question: SurveyQuestion;
  value: string | null;
  onChange: (value: string) => void;
}

const OpenResponseQuestion: FC<OpenResponseQuestionProps> = ({ question, value, onChange }) => {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-serif text-[28px] font-bold leading-tight text-white sm:text-[36px]">
        {question.question}
      </h2>

      <input
        type={question.inputType === "email" ? "email" : "text"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder || "Type your answer..."}
        autoComplete={question.inputType === "email" ? "email" : "off"}
        className="w-full border-b-2 border-white/20 bg-transparent py-4 font-sans text-[20px] text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none sm:text-[24px]"
      />

      {!question.required && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="self-start font-sans text-[14px] font-medium text-[#fe6839] transition hover:text-[#ff8f6b]"
        >
          Skip for now
        </button>
      )}
    </div>
  );
};

export default OpenResponseQuestion;
