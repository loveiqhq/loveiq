"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

/**
 * The guide line a question shows under its title (Figma 11303:174). The few
 * questions without a guide show their answer instruction there instead.
 * GuidancePanel's "Info & guidance" repeats it on purpose — the frame does, and
 * that was the call (2026-10-04).
 */
export function questionGuide(question: SurveyQuestion): string {
  return question.supportAndGuidance || question.guide || question.formatGuidance || "";
}

/** Shared question title + guide line. */
const QuestionHeading: FC<{ question: SurveyQuestion }> = ({ question }) => {
  const guide = questionGuide(question);

  return (
    <div className="flex flex-col gap-[8.8px]">
      <h2 className="break-words font-serif text-[22.4px] font-medium leading-[1.2] text-[#161021] sm:text-[32px]">
        {question.question}
      </h2>
      {guide && (
        <p className="font-sans text-[13.5px] leading-[20.25px] text-[#4a4458] sm:max-w-[625px]">
          {guide}
        </p>
      )}
    </div>
  );
};

export default QuestionHeading;
