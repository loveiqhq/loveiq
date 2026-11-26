"use client";

import { useState, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import ChoiceCard from "./ChoiceCard";
import GroupedChoiceList from "./GroupedChoiceList";
import QuestionHeading from "./QuestionHeading";
import { getOptionExplanation } from "./getOptionExplanation";
import { useOrderedOptionGroups } from "./useOrderedOptionGroups";
import { useOrderedOptions } from "./useOrderedOptions";
import { useSurveyTheme } from "../SurveyThemeContext";

/** An answer that means "none of the above". */
export const isExclusive = (option: string) => /^none of these\b/i.test(option);

interface MultipleChoiceQuestionProps {
  question: SurveyQuestion;
  value: string[] | null;
  onChange: (value: string[]) => void;
  otherText?: string;
  onOtherTextChange?: (text: string) => void;
  forceValidation?: boolean;
}

const CheckMark: FC = () => (
  <svg
    aria-hidden
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#ffffff"
    strokeWidth="3.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * Survey 2.0's compact choice (Mark's 16016 boards): a tile in the areas grid, or a row under a
 * topics heading. Picked: plum border and fill with a filled box.
 */
const CompactChoice: FC<{
  label: string;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
  tile?: boolean;
}> = ({ label, selected, dimmed, onClick, tile = false }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={selected}
    onClick={onClick}
    className={`focus-visible-ring flex items-center justify-between gap-2 text-left font-sans transition-colors duration-150 ${
      tile
        ? "min-h-[52px] rounded-[14px] px-3 py-2 text-[14px] font-medium leading-[19px]"
        : "min-h-12 rounded-xl px-4 py-[6px] text-[15px] leading-[21px]"
    } ${
      selected
        ? "border-[1.5px] border-[#6b5b95] bg-[#f4f1fb] text-[#161021]"
        : "border border-[#e8e8ee] bg-[#f3f4f7] text-[#413b4d]"
    } ${dimmed ? "opacity-60" : ""}`}
  >
    <span className="min-w-0 flex-1">{label}</span>
    {selected ? (
      <span className="flex size-5 flex-none items-center justify-center rounded-md bg-[#6b5b95]">
        <CheckMark />
      </span>
    ) : tile ? null : (
      <span aria-hidden className="size-5 flex-none rounded-md border-[1.5px] border-[#c2c3c6]" />
    )}
  </button>
);

const MultipleChoiceQuestion: FC<MultipleChoiceQuestionProps> = ({
  question,
  value,
  onChange,
  otherText,
  onOtherTextChange,
  forceValidation = false,
}) => {
  // Coerce stale localStorage strings from the earlier single->multiple migration.
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const [attemptedOverLimit, setAttemptedOverLimit] = useState(false);
  const maxSelections = question.maxSelections;
  const isOverLimit = typeof maxSelections === "number" && selected.length > maxSelections;
  const atLimit = typeof maxSelections === "number" && selected.length >= maxSelections;
  const showLimitMessage =
    typeof maxSelections === "number" &&
    (attemptedOverLimit || isOverLimit || (forceValidation && isOverLimit));

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      setAttemptedOverLimit(false);
      onChange(selected.filter((v) => v !== option));
      return;
    }

    // "None of these" and any other pick exclude each other: both together was a
    // contradiction the survey stored.
    if (isExclusive(option)) {
      setAttemptedOverLimit(false);
      onChange([option]);
      return;
    }
    const others = selected.filter((v) => !isExclusive(v));

    if (typeof maxSelections === "number" && others.length >= maxSelections) {
      setAttemptedOverLimit(true);
      return;
    }

    setAttemptedOverLimit(false);
    onChange([...others, option]);
  };

  const white = useSurveyTheme() === "white";
  const options = useOrderedOptions(question);
  // Categories for a grouped question (C9), in the same order `orderedOptions` records.
  const groups = useOrderedOptionGroups(question);

  return (
    <div className="flex flex-col gap-5">
      <QuestionHeading question={question} />

      {showLimitMessage && typeof maxSelections === "number" && (
        <p
          role="alert"
          aria-live="polite"
          className="font-sans text-[13px] font-medium text-[#ef4444]"
        >
          You can select up to {maxSelections} {maxSelections === 1 ? "option" : "options"}.
          Deselect one to choose another.
        </p>
      )}

      {question.optionLayout === "grid" ? (
        <div role="group" aria-label={question.question} className="grid grid-cols-2 gap-2">
          {options.map((option) => (
            <CompactChoice
              key={option}
              tile
              label={question.optionLabels?.[option] ?? option}
              selected={selected.includes(option)}
              dimmed={atLimit && !selected.includes(option)}
              onClick={() => toggle(option)}
            />
          ))}
        </div>
      ) : question.optionLayout === "sections" && groups ? (
        <div className="flex flex-col gap-[14px]">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="m-0 font-sans text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#6b5b95]">
                {group.label}
              </h3>
              <div className="mt-2 flex flex-col gap-2">
                {group.options.map((option) => (
                  <CompactChoice
                    key={option}
                    label={question.optionLabels?.[option] ?? option}
                    selected={selected.includes(option)}
                    dimmed={atLimit && !selected.includes(option)}
                    onClick={() => toggle(option)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : groups ? (
        <GroupedChoiceList
          question={question}
          groups={groups}
          selected={selected}
          atLimit={atLimit}
          onToggle={toggle}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {options.map((option) => {
            const isSelected = selected.includes(option);

            return (
              <ChoiceCard
                key={option}
                label={question.optionLabels?.[option] ?? option}
                description={isSelected ? getOptionExplanation(question, option) : undefined}
                selected={isSelected}
                onClick={() => toggle(option)}
                multi
                dimmed={atLimit && !isSelected}
              />
            );
          })}
        </div>
      )}

      {selected.some((s) => /^other\b/i.test(s)) && (
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

export default MultipleChoiceQuestion;
