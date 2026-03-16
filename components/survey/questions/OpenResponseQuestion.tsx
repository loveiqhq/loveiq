"use client";

import { useState, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

interface OpenResponseQuestionProps {
  question: SurveyQuestion;
  value: string | null;
  onChange: (value: string) => void;
  forceValidation?: boolean;
}

const AlertCircleIcon: FC = () => (
  <svg
    aria-hidden
    className="h-4 w-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const MAX_LENGTH = 500;

function getValidationError(value: string, inputType?: string): string | null {
  if (!value) return null;
  if (inputType === "email") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value))
      return "Hmm, that doesn\u2019t look like a valid email. Make sure it follows the format: name@example.com";
  }
  if (value.length > MAX_LENGTH) return `Maximum ${MAX_LENGTH} characters allowed`;
  return null;
}

const OpenResponseQuestion: FC<OpenResponseQuestionProps> = ({
  question,
  value,
  onChange,
  forceValidation,
}) => {
  const [touched, setTouched] = useState(false);
  const currentValue = value ?? "";
  const showError = touched || forceValidation;
  const error = showError ? getValidationError(currentValue, question.inputType) : null;

  // Subtitle text from formatGuidance or fallback
  const subtitle =
    question.formatGuidance ||
    (question.inputType === "email" ? "Please enter your email address" : null);

  return (
    <div className="flex flex-col gap-5">
      {/* Question title */}
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[31px] font-medium leading-[1.2] text-white sm:text-[39px]">
          {question.question}
        </h2>
        {subtitle && <p className="font-sans text-[15px] font-medium text-[#a78bfa]">{subtitle}</p>}
      </div>

      {/* Input */}
      <div className="flex flex-col gap-2">
        <input
          type={question.inputType === "email" ? "email" : "text"}
          value={currentValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={question.placeholder || "Type your answer..."}
          autoComplete={question.inputType === "email" ? "email" : "off"}
          maxLength={MAX_LENGTH}
          className={`w-full border-b-2 bg-transparent pb-3 pt-2 font-sans text-[22px] text-white placeholder:text-white/30 focus:outline-none sm:text-[24px] ${
            error
              ? "border-[#ef4444]"
              : "border-[rgba(254,104,57,0.2)] focus:border-[rgba(254,104,57,0.4)]"
          }`}
        />

        {/* Below input: error message left, char count right */}
        <div className="flex items-start justify-between gap-4">
          {/* Error message */}
          <div className="flex items-center gap-1.5">
            {error && (
              <>
                <span className="text-[#ef4444]">
                  <AlertCircleIcon />
                </span>
                <span className="font-sans text-[13px] font-medium text-[#ef4444]">{error}</span>
              </>
            )}
          </div>

          {/* Character counter */}
          <span className="font-sans text-[12px] font-medium text-white/30">
            {currentValue.length} / {MAX_LENGTH}
          </span>
        </div>
      </div>
    </div>
  );
};

export default OpenResponseQuestion;
