"use client";

import { useEffect, useRef, useState, type FC, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
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

/** Where the sticky footer starts. Unpinned on a short window it can sit below the fold. */
function footerEdge(): number {
  const footer = document.querySelector("[data-survey-footer]");
  return Math.min(footer ? footer.getBoundingClientRect().top : Infinity, window.innerHeight);
}

/** The category headings not fully above the footer. */
function hiddenHeadings(list: HTMLElement | null): Element[] {
  const edge = footerEdge();
  return [...(list?.querySelectorAll("button[aria-controls]") ?? [])].filter(
    (heading) => heading.getBoundingClientRect().bottom > edge + 1
  );
}

/**
 * A multi-select's options under collapsible category headings: C9's thirteen categories
 * (see `features/survey/optionGroups.ts`).
 *
 * One category is open at a time and all start closed, so the respondent sees the headings
 * before committing to one. Thirteen never fit on a phone, though, and a heading ending
 * right at the sticky footer made the list look finished (Mark, 2026-10-06: "not entirely
 * clear that you can scroll down for more options"). So the headings are compact, and
 * while some sit under the footer a pill above it says how many; a tap brings the next one
 * up. A heading that holds picks says how many, so a choice made inside a closed category
 * is never out of sight. Closed panels are `inert` as well as `aria-hidden`: their topics
 * can be neither tabbed to nor clicked.
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
  const listRef = useRef<HTMLDivElement | null>(null);
  // Headings not fully above the footer, and how far the footer's top is from the bottom
  // of the screen (0 when the footer is not pinned there).
  const [below, setBelow] = useState({ count: 0, bottom: 0 });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const count = hiddenHeadings(list).length;
      const bottom = Math.round(window.innerHeight - footerEdge());
      setBelow((prev) =>
        prev.count === count && prev.bottom === bottom ? prev : { count, bottom }
      );
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    // The question slides in, and a category eases open or shut: neither scrolls or
    // resizes the list, and the count read during either was off by a heading.
    window.addEventListener("animationend", measure);
    window.addEventListener("transitionend", measure);
    // Opening or closing a category changes the list's height without a scroll.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(list);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("animationend", measure);
      window.removeEventListener("transitionend", measure);
      observer?.disconnect();
    };
  }, []);

  const showNext = () => {
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    hiddenHeadings(listRef.current)[0]?.scrollIntoView({
      block: "center",
      behavior: smooth ? "smooth" : "auto",
    });
  };

  return (
    <div ref={listRef} className="flex flex-col gap-2">
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
              className={`flex min-h-[52px] w-full items-center gap-3 rounded-[16px] px-[21px] text-left font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 ${
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
      {/* A visual cue only: the headings it points at are next in the reading order. */}
      {below.count > 0
        ? createPortal(
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={showNext}
              // Centred on the footer's top edge, so it covers as little of the list as it
              // can; with no footer pinned there, clear of the screen's bottom edge.
              style={{ bottom: below.bottom > 0 ? below.bottom : 12 }}
              className={`fixed left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 font-sans ${
                below.bottom > 0 ? "translate-y-1/2" : ""
              } text-[13px] font-semibold leading-[18px] shadow-[0_6px_18px_rgba(22,16,33,0.14)] ${
                white
                  ? "border-black/[0.08] bg-white text-[#6b5b95]"
                  : "border-white/15 bg-[#1a1324] text-white/80"
              }`}
            >
              <ChevronIcon open={false} />
              {below.count} more {below.count === 1 ? "category" : "categories"}
            </button>,
            document.body
          )
        : null}
    </div>
  );
};

export default GroupedChoiceList;
