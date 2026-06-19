"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import { useSurveyTheme } from "../SurveyThemeContext";

/**
 * Shared question title + optional subtitle. Theme-aware for the survey white
 * A/B: the dark branch emits the exact classes the question components used
 * inline before extraction (byte-identical dark arm); white uses ink + a
 * readable purple subtitle. Subtitle renders only when the canonical data
 * (`question.formatGuidance`) supplies one.
 */
const QuestionHeading: FC<{ question: SurveyQuestion }> = ({ question }) => {
  const white = useSurveyTheme() === "white";
  const subtitle = question.formatGuidance ?? "";

  return (
    <div className="flex flex-col gap-2">
      <h2
        className={`font-serif text-[31px] font-medium leading-[1.2] break-words sm:text-[39px] ${
          white ? "text-[#161021]" : "text-white"
        }`}
      >
        {question.question}
      </h2>
      {subtitle && (
        <p
          className={`font-sans text-[15px] font-medium ${white ? "text-[#6b5b95]" : "text-[#a78bfa]"}`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};

export default QuestionHeading;
