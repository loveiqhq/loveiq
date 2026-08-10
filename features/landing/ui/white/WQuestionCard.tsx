"use client";

import { useState, useSyncExternalStore, type FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";
import {
  LANDING_PREFILL_QID,
  SURVEY_STATE_KEY,
  saveLandingPrefill,
} from "@features/survey/ui/hooks/surveyStorage";

/**
 * The survey's first question, asked on the landing page (Figma 9200:32861 in
 * the hero, 9200:32908 in the final CTA).
 *
 * This is the real thing, not a demo: answering stores the answer against
 * `LANDING_PREFILL_QID` and marks it prefilled, so SurveyEngine drops it from
 * the flow. 59 questions in total — 1 here, 58 inside /survey — and the answer
 * submits and scores exactly like any other.
 *
 * Answering deliberately does NOT navigate. The answer is saved straight away
 * (so it survives even if the visitor wanders off) and a "Continue" CTA reveals
 * underneath; the visitor is free to change their pick first, and only moves on
 * when they choose to.
 *
 * Copy is duplicated from `data/survey-data.ts` on purpose; importing that 80 KB
 * module into the landing bundle for three strings is not worth it. Keep it in
 * sync if Q01002 is reworded (and TOTAL_QUESTIONS if items are added/removed).
 */

const QUESTION_TEXT = "Right now, I feel satisfied with my sex life.";
const GUIDE_SHORT = "Think about the last one to two months overall, not your best or worst day.";
const GUIDE_LONG = `${GUIDE_SHORT} If you are not having sex right now, rate how you feel about that.`;
const TOTAL_QUESTIONS = 59;

/** Ring / dot diameters per scale point (Figma "scale" asset, 1→7). */
const SCALE = [
  {
    ring: "h-[34px] w-[34px] sm:h-[45px] sm:w-[45px]",
    dot: "h-[12px] w-[12px] sm:h-[15px] sm:w-[15px]",
  },
  {
    ring: "h-[29px] w-[29px] sm:h-[37px] sm:w-[37px]",
    dot: "h-[10px] w-[10px] sm:h-[12px] sm:w-[12px]",
  },
  {
    ring: "h-[24px] w-[24px] sm:h-[30px] sm:w-[30px]",
    dot: "h-[8px] w-[8px] sm:h-[10px] sm:w-[10px]",
  },
  {
    // 24px, not the Figma-proportional 21: below that it is the only touch
    // target on the page under the WCAG 2.2 minimum. Desktop keeps 26.
    ring: "h-[24px] w-[24px] sm:h-[26px] sm:w-[26px]",
    dot: "h-[7px] w-[7px] sm:h-[9px] sm:w-[9px]",
  },
  {
    ring: "h-[24px] w-[24px] sm:h-[30px] sm:w-[30px]",
    dot: "h-[8px] w-[8px] sm:h-[10px] sm:w-[10px]",
  },
  {
    ring: "h-[29px] w-[29px] sm:h-[37px] sm:w-[37px]",
    dot: "h-[10px] w-[10px] sm:h-[12px] sm:w-[12px]",
  },
  {
    ring: "h-[34px] w-[34px] sm:h-[45px] sm:w-[45px]",
    dot: "h-[12px] w-[12px] sm:h-[15px] sm:w-[15px]",
  },
];

/**
 * The pick is shared by both cards on the page (hero + closing CTA) and seeded
 * from the saved draft, so answering in one is reflected in the other and a
 * returning visitor sees the choice they already made. `useSyncExternalStore`
 * rather than a mount effect: the server snapshot is null, so hydration matches
 * and there is no setState-in-effect (which this repo lints as an error).
 */
const pickListeners = new Set<() => void>();

/** Read straight from the draft — no cache to go stale, and a number snapshot
 *  is stable by value, which is all useSyncExternalStore needs. */
function getPickSnapshot(): number | null {
  try {
    const raw = window.localStorage.getItem(SURVEY_STATE_KEY);
    const value = raw ? JSON.parse(raw)?.answers?.[LANDING_PREFILL_QID] : null;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

function subscribeToPick(listener: () => void): () => void {
  pickListeners.add(listener);
  return () => pickListeners.delete(listener);
}

interface WQuestionCardProps {
  /** "hero" = compact card beside the headline; "final" = wider closing card. */
  size?: "hero" | "final";
  /** Analytics label for the hand-off to the rest of the survey. */
  location: "hero" | "footer";
  className?: string;
}

const WQuestionCard: FC<WQuestionCardProps> = ({ size = "hero", location, className = "" }) => {
  const selected = useSyncExternalStore(subscribeToPick, getPickSnapshot, () => null);
  const [why, setWhy] = useState(false);
  const large = size === "final";
  const answered = selected !== null;

  // Saved on every tap — including a change of mind — so the pick is never lost
  // even if the visitor never presses Continue.
  const answer = (value: number) => {
    saveLandingPrefill(LANDING_PREFILL_QID, value);
    pickListeners.forEach((listener) => listener());
  };

  return (
    <div
      className={`w-full rounded-[20px] border border-[#e9e6ee] bg-white ${
        large ? "px-5 pb-6 pt-7 sm:px-7" : "px-5 pb-[22px] pt-6 sm:px-6"
      } shadow-[0_4px_9px_rgba(20,15,33,0.06)] ${className}`}
    >
      {/* Head */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold tracking-[0.5px] text-[#605b6d]">
          QUESTION 1 OF {TOTAL_QUESTIONS}
        </span>
        <span className="shrink-0 rounded-full bg-[rgba(107,91,149,0.09)] px-2.5 py-[5px] text-[10px] font-semibold text-[#6b5b95]">
          {answered ? "Tap again to change" : "Tap a dot to answer"}
        </span>
      </div>

      <p
        className={`mt-3.5 font-serif font-medium text-[#161021] ${
          large
            ? "text-[20px] leading-[28px] sm:text-[24px] sm:leading-[32px]"
            : "text-[19px] leading-[26px] sm:text-[20px] sm:leading-[27px]"
        }`}
      >
        {QUESTION_TEXT}
      </p>

      {/* Guide */}
      <div className="mt-2.5 flex items-start gap-2.5">
        <svg
          aria-hidden
          className={`mt-0.5 shrink-0 ${large ? "h-[15px] w-[15px]" : "h-[14px] w-[14px]"}`}
          viewBox="0 0 14 14"
          fill="none"
          stroke="#6b5b95"
          strokeWidth="1.16667"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 4.083V12.25" />
          <path d="M1.75 10.5a.583.583 0 0 1-.583-.583V2.333c0-.322.261-.583.583-.583h2.917A2.333 2.333 0 0 1 7 4.083 2.333 2.333 0 0 1 9.333 1.75h2.917c.322 0 .583.261.583.583v7.584a.583.583 0 0 1-.583.583H8.75A1.75 1.75 0 0 0 7 12.25a1.75 1.75 0 0 0-1.75-1.75H1.75Z" />
        </svg>
        <p
          className={`text-[#605b6d] ${large ? "text-[12.5px] leading-[18px]" : "text-[12px] leading-[17px]"}`}
        >
          {large ? GUIDE_LONG : GUIDE_SHORT}
        </p>
      </div>

      {/* 7-point scale */}
      <div
        className={`relative ${large ? "mt-6" : "mt-5"}`}
        role="group"
        aria-label={QUESTION_TEXT}
      >
        <span
          aria-hidden
          className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-[#e7e7e8]"
        />
        <div className="relative flex items-center justify-between">
          {SCALE.map((s, i) => {
            const value = i + 1;
            const isOn = selected === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => answer(value)}
                aria-label={`${value} of 7 — ${value === 1 ? "not true at all" : value === 7 ? "completely true" : "in between"}`}
                aria-pressed={isOn}
                className={`focus-visible-ring group flex shrink-0 items-center justify-center rounded-full border-[1.5px] bg-white transition duration-200 ease-out hover:scale-110 hover:border-[#6b5b95] motion-reduce:transition-none motion-reduce:hover:scale-100 ${s.ring} ${
                  isOn
                    ? "border-[#6b5b95] shadow-[0_0_0_4px_rgba(107,91,149,0.15)]"
                    : "border-[#e7e7e8]"
                }`}
              >
                <span
                  className={`rounded-full bg-[#6b5b95] transition-transform duration-200 ease-out group-hover:scale-110 motion-reduce:transition-none ${s.dot} ${
                    isOn ? "scale-110" : ""
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Anchors */}
      <div
        className={`mt-2.5 flex items-start justify-between gap-3 font-semibold ${large ? "text-[11.5px]" : "text-[11px]"}`}
      >
        <span className="text-[#6f6a7a]">Not true at all</span>
        <span className="text-right text-[#6b5b95]">Completely true</span>
      </div>

      <div className={`${large ? "mt-[18px]" : "mt-4"} h-px w-full bg-[#e9e6ee]`} />

      {/* Why we ask this */}
      <button
        type="button"
        onClick={() => setWhy((v) => !v)}
        aria-expanded={why}
        // -my-1/py-1: a 24px-tall tap target without changing the spacing.
        className={`focus-visible-ring -my-1 flex w-full items-center gap-[7px] py-1 text-left ${large ? "mt-3.5" : "mt-3"}`}
      >
        <svg
          aria-hidden
          className={`h-3 w-3 shrink-0 text-[#6b5b95] transition-transform duration-300 ${why ? "rotate-90" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 9 7.5 6 4.5 3" />
        </svg>
        <span className="text-[12px] font-semibold text-[#6b5b95]">Why we ask this</span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${why ? "grid-rows-[1fr] pt-2" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <p className="text-[12px] leading-[18px] text-[#605b6d]">
            This sets the baseline your whole result is read against. Answer it here and we carry it
            straight into your test — you will not be asked again.
          </p>
        </div>
      </div>

      {/* Hand-off. Revealed only once something is picked — answering never
          navigates on its own, so the visitor can change their mind first. The
          0fr→1fr grid keeps the reveal a smooth height animation. */}
      <div
        className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${
          answered ? "grid-rows-[1fr] pt-4 opacity-100" : "grid-rows-[0fr] pt-0 opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <Link
            href="/survey"
            tabIndex={answered ? undefined : -1}
            aria-hidden={!answered}
            aria-label="Continue to the survey"
            onClick={() => trackStartSurvey(location)}
            className="focus-visible-ring group flex w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-br from-[#fe6839] via-[#bf66d9] via-[43%] to-[#958ef6] px-[22px] py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_26px_-12px_rgba(191,102,217,0.75)] transition duration-300 hover:shadow-[0_14px_30px_-10px_rgba(191,102,217,0.85)] motion-safe:hover:-translate-y-0.5 sm:text-[16px]"
          >
            <span>Continue to the survey</span>
            <svg
              aria-hidden
              className="h-[17px] w-[17px] transition-transform duration-300 motion-safe:group-hover:translate-x-1"
              viewBox="0 0 17 17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.42"
            >
              <path d="M3.54 8.5h9.92M9.21 12.75 13.46 8.5 9.21 4.25" />
            </svg>
          </Link>
          <p className="mt-2 text-center text-[11.5px] text-[#605b6d]">
            Answer saved · {TOTAL_QUESTIONS - 1} questions left
          </p>
        </div>
      </div>

      {/* Announced to screen readers only; the visual confirmation is above. */}
      <p aria-live="polite" className="sr-only">
        {answered ? "Answer saved. Continue to the survey when you are ready." : ""}
      </p>
    </div>
  );
};

export default WQuestionCard;
