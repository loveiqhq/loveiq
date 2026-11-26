"use client";

import { Fragment, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import {
  EXPERT_COPY,
  EXPERT_QID,
  expertPhoneValid,
  isExpertYes,
} from "@features/survey/survey2/expert";
import ChoiceCard from "./ChoiceCard";
import ExpertPhoneField from "./ExpertPhoneField";
import QuestionHeading from "./QuestionHeading";
import { getOptionExplanation } from "./getOptionExplanation";
import { useOrderedOptions } from "./useOrderedOptions";
import { useSurveyTheme } from "../SurveyThemeContext";

interface SingleChoiceQuestionProps {
  question: SurveyQuestion;
  value: string | null;
  onChange: (value: string) => void;
  otherText?: string;
  onOtherTextChange?: (text: string) => void;
  /** Next was refused here: a field under an option says what is missing. */
  forceValidation?: boolean;
}

const SingleChoiceQuestion: FC<SingleChoiceQuestionProps> = ({
  question,
  value,
  onChange,
  otherText,
  onOtherTextChange,
  forceValidation = false,
}) => {
  const white = useSurveyTheme() === "white";
  const options = useOrderedOptions(question);
  // Survey 2.0's expert question (Mark's board "Q-new-expert"): a "Free" tag on the Yes, and
  // under a picked Yes the phone number our expert calls, kept in the question's text box.
  const expert = question.qId === EXPERT_QID;

  return (
    <div className="flex flex-col gap-5">
      {/* Title + subtitle */}
      <QuestionHeading question={question} />

      {/* Options — single column, in this session's display order */}
      <div className="flex flex-col gap-3">
        {options.map((option) => (
          <Fragment key={option}>
            <ChoiceCard
              label={question.optionLabels?.[option] ?? option}
              description={value === option ? getOptionExplanation(question, option) : undefined}
              selected={value === option}
              onClick={() => {
                // A number typed under the Yes goes with it: another answer keeps none.
                if (expert && !isExpertYes(option) && otherText) onOtherTextChange?.("");
                onChange(option);
              }}
              dimmed={value !== null && value !== option}
              badge={expert && isExpertYes(option) ? EXPERT_COPY.freeTag : undefined}
            />
            {expert && value === option && isExpertYes(option) && (
              <ExpertPhoneField
                value={otherText ?? ""}
                onChange={(text) => onOtherTextChange?.(text)}
                showError={forceValidation && !expertPhoneValid(otherText)}
              />
            )}
          </Fragment>
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
          // The server keeps 1000 characters; more was refused at the final submit.
          maxLength={500}
          className={`w-full border-b-2 border-[rgba(107,91,149,0.2)] bg-transparent pb-3 pt-2 font-sans text-[18px] focus:border-[rgba(107,91,149,0.4)] focus:outline-none ${
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
