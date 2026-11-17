"use client";

import { useId, useRef, type FC, type KeyboardEvent } from "react";
import { useLandingPick } from "@features/landing/logic/landingPick";
import PCta from "./PCta";
import { PP_FOCUS } from "./ppStyles";
import { HERO, QUESTION_1 } from "./painPointContent";

/** The board's dot diameters, 1 to 7: large at the ends, small in the middle. */
const DOT_SIZES = [40, 34, 28, 24, 28, 34, 40] as const;
/** Unpicked rims: warm for "not true", grey for neutral, violet for "true". */
const rimFor = (i: number) => (i < 3 ? "#e6b5a6" : i > 3 ? "#c9bff0" : "#e0dce6");

/**
 * Question 1 of the survey, asked in the hero (board Hero 3, "inline question"): seven
 * dots, then the button. The answer is saved into the survey draft as you tap
 * (useLandingPick), so /survey skips the question; the button then reads "Continue free
 * test" and counts as question 1's continue. A radio group: one dot is in the tab order,
 * and the arrow keys move between them.
 */
const PHeroQuestion: FC = () => {
  const { selected, pick } = useLandingPick();
  const questionId = useId();
  const dotsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const answered = selected !== null;
  // The roving tab stop: the picked dot, or the first before any pick.
  const tabStop = answered ? selected - 1 : 0;

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (i + step + DOT_SIZES.length) % DOT_SIZES.length;
    pick(next + 1, "hero");
    dotsRef.current[next]?.focus();
  };

  return (
    <div id="start" className="flex max-w-[520px] flex-col gap-4 border-t border-[#e9e6ee] pt-6">
      <p
        id={questionId}
        className="m-0 font-serif text-[22px] font-medium leading-[30px] text-[#161021]"
      >
        {QUESTION_1}
      </p>
      <div
        role="radiogroup"
        // Named by the statement it rates, as the video page's card names its scale.
        aria-labelledby={questionId}
        className="flex items-center justify-between gap-[6px]"
      >
        {HERO.scaleLabels.map((label, i) => {
          const value = i + 1;
          const on = selected === value;
          const size = DOT_SIZES[i];
          return (
            <button
              key={label}
              ref={(el) => {
                dotsRef.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label}
              tabIndex={i === tabStop ? 0 : -1}
              onClick={() => pick(value, "hero")}
              onKeyDown={(event) => onKey(event, i)}
              className={`box-border cursor-pointer rounded-full p-0 transition-transform duration-200 hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100 ${PP_FOCUS}`}
              style={
                on
                  ? {
                      width: size,
                      height: size,
                      minWidth: size,
                      border: "none",
                      background: "linear-gradient(135deg,#fe6839 0%,#bf66d9 43%,#958ef6 100%)",
                      boxShadow: "0 6px 14px -6px rgba(191,102,217,0.8)",
                    }
                  : {
                      width: size,
                      height: size,
                      minWidth: size,
                      border: `2px solid ${rimFor(i)}`,
                      background: "#ffffff",
                    }
              }
            />
          );
        })}
      </div>
      <div className="-mt-2 flex justify-between text-[12px] text-[#6b6678]">
        <span>{HERO.scaleLow}</span>
        <span>{HERO.scaleHigh}</span>
      </div>
      <PCta
        label={answered ? HERO.ctaContinue : HERO.ctaStart}
        place="hero"
        location="hero"
        element={answered ? "question_card" : undefined}
        className="self-start"
      />
    </div>
  );
};

export default PHeroQuestion;
