"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

/** The guide line a question shows under its title (Figma 11303:174). */
export function questionGuide(question: SurveyQuestion): string {
  return question.supportAndGuidance || question.guide || "";
}

/**
 * The answer instruction under the guide, in purple: the source's "Answer format
 * guidance" column (Figma 11303:174, node 11592:6080, ready for dev 2026-10-06).
 * Never a repeat of the guide line.
 */
export function answerInstruction(question: SurveyQuestion): string {
  const instruction = question.formatGuidance || "";
  return instruction && instruction !== questionGuide(question) ? instruction : "";
}

/** Shared question title, guide line and answer instruction. */
const QuestionHeading: FC<{ question: SurveyQuestion }> = ({ question }) => {
  const guide = questionGuide(question);
  const instruction = answerInstruction(question);

  return (
    <div className="flex flex-col gap-[8.8px]">
      <h2 className="break-words font-serif text-[22.4px] font-medium leading-[1.2] text-[#161021] sm:text-[32px]">
        {question.question}
      </h2>
      {(guide || instruction) && (
        <div className="flex flex-col gap-2">
          {guide && (
            <p className="font-sans text-[13.5px] leading-[20.25px] text-[#4a4458] sm:max-w-[625px]">
              {guide}
            </p>
          )}
          {instruction && (
            <p className="font-sans text-[13.008px] font-medium leading-[18.583px] text-[#a78bfa]">
              {instruction}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default QuestionHeading;
