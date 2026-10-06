"use client";

import { useState, type FC, type KeyboardEvent } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import type { OptionGroup } from "@features/survey/optionGroups";
import ChoiceCard from "./ChoiceCard";
import { getOptionExplanation } from "./getOptionExplanation";
import { useSurveyTheme } from "../SurveyThemeContext";

interface GroupedChoiceListProps {
  question: SurveyQuestion;
  groups: OptionGroup[];
  selected: string[];
  atLimit: boolean;
  onToggle: (option: string) => void;
}

const ChevronIcon: FC<{ open: boolean }> = ({ open }) => (
  <svg
    aria-hidden
    className={`h-5 w-5 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/**
 * SurveyEngine listens for Enter on `window` and treats it as Next once the question has
 * an answer. On a category header Enter means "open this", so it stops here, the same
 * containment CountryQuestion applies to its search box.
 */
function containActivationKeys(e: KeyboardEvent<HTMLButtonElement>) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}

/**
 * A multi-select's options under collapsible category headings: C9's thirteen categories
 * (see `features/survey/optionGroups.ts`).
 *
 * One category is open at a time and all start closed, so the whole set of headings fits
 * on a phone before the respondent commits to one. A heading that holds picks says how
 * many, so a choice made inside a closed category is never out of sight. Closed panels are
 * `inert` as well as `aria-hidden`: their topics can be neither tabbed to nor clicked.
 *
 * Selection, the cap and click order stay with MultipleChoiceQuestion, which passes
 * `onToggle` down unchanged, so a grouped question is capped and recorded exactly like a
 * flat one.
 */
const GroupedChoiceList: FC<GroupedChoiceListProps> = ({
  question,
  groups,
  selected,
  atLimit,
  onToggle,
}) => {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const white = useSurveyTheme() === "white";

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, index) => {
        const isOpen = openLabel === group.label;
        const picked = group.options.filter((option) => selected.includes(option)).length;
        const panelId = `${question.qId}-group-${index}`;
        const highlighted = isOpen || picked > 0;

        return (
          <div
            key={group.label}
            className={`rounded-[16px] border transition-[border-color,background-color,box-shadow] duration-200 ${
              white
                ? highlighted
                  ? "border-[rgba(254,104,57,0.35)] bg-white shadow-[0_0_20px_rgba(254,104,57,0.08)]"
                  : "border-black/[0.08] bg-white"
                : highlighted
                  ? "border-[rgba(254,104,57,0.4)] bg-white/[0.05]"
                  : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenLabel(isOpen ? null : group.label)}
              onKeyDown={containActivationKeys}
              className={`flex min-h-[64px] w-full items-center gap-3 rounded-[16px] px-[21px] text-left font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 ${
                white ? "focus-visible:ring-offset-white" : "focus-visible:ring-offset-[#0a0510]"
              }`}
            >
              <span
                className={`min-w-0 flex-1 text-[16px] font-semibold leading-[24px] ${
                  white ? "text-[#161021]" : "text-white"
                }`}
              >
                {group.label}
              </span>
              {picked > 0 ? (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-[3px] text-[12px] font-semibold leading-[16px] ${
                    white
                      ? "bg-[rgba(254,104,57,0.12)] text-[#c2410c]"
                      : "bg-[rgba(254,104,57,0.18)] text-[#ffb59f]"
                  }`}
                >
                  {picked} selected
                </span>
              ) : null}
              <span className={white ? "text-[#6f6a7a]" : "text-white/50"}>
                <ChevronIcon open={isOpen} />
              </span>
            </button>

            <div
              id={panelId}
              role="group"
              aria-label={group.label}
              aria-hidden={!isOpen}
              inert={!isOpen}
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="flex flex-col gap-3 px-3 pb-3">
                  {group.options.map((option) => {
                    const isSelected = selected.includes(option);
                    return (
                      <ChoiceCard
                        key={option}
                        label={option}
                        description={
                          isSelected ? getOptionExplanation(question, option) : undefined
                        }
                        selected={isSelected}
                        onClick={() => onToggle(option)}
                        multi
                        dimmed={atLimit && !isSelected}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GroupedChoiceList;
