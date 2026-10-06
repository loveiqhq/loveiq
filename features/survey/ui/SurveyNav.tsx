"use client";

import type { FC } from "react";

interface SurveyNavProps {
  canGoBack: boolean;
  canGoNext: boolean;
  hasAnswer: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

// 14px chevrons with a 1.4px stroke (Figma 11303:221 / 11303:226).
const Chevron: FC<{ d: string }> = ({ d }) => (
  <svg
    aria-hidden
    className="h-[14px] w-[14px] shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const SurveyNav: FC<SurveyNavProps> = ({ canGoBack, canGoNext, hasAnswer, onPrevious, onNext }) => (
  <nav className="flex items-center justify-between gap-3 px-[18.4px] pb-[18.4px] pt-[20.8px] sm:px-[35px] sm:pb-7">
    <button
      type="button"
      onClick={onPrevious}
      disabled={!canGoBack}
      className="flex items-center gap-[6.4px] rounded-full border border-[rgba(22,16,33,0.09)] px-[17.6px] py-[8.6px] font-sans text-[14px] font-semibold leading-5 text-[#4a4458] transition-[background-color,opacity] hover:bg-[rgba(22,16,33,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-[0.32]"
    >
      <Chevron d="m15 18-6-6 6-6" />
      Previous
    </button>

    <button
      type="button"
      onClick={onNext}
      disabled={!canGoNext}
      className={`flex items-center gap-[7.2px] rounded-full bg-[#e8511f] px-6 py-[11.5px] font-sans text-[15px] font-bold leading-[21px] text-white transition-[opacity,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none ${
        hasAnswer
          ? "shadow-[0_8px_28px_rgba(232,81,31,0.4)] hover:shadow-[0_10px_32px_rgba(232,81,31,0.5)]"
          : "opacity-60"
      }`}
    >
      Next
      <Chevron d="m9 18 6-6-6-6" />
    </button>
  </nav>
);

export default SurveyNav;
