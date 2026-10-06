"use client";

import type { FC, ReactNode } from "react";

interface SurveyNavProps {
  canGoBack: boolean;
  canGoNext: boolean;
  hasAnswer: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** The progress strip, drawn between the two buttons (Figma 11303:219). */
  progress?: ReactNode;
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

/**
 * The question screen's footer: Previous, the progress strip and Next in one slim row
 * (Figma 11303:174, ready for dev 2026-10-06; 78px tall with the card's border). The
 * hairline is 1px of the frame's 16px top padding and the card's border 1px of its
 * 17.6px bottom and 36px sides, hence 15, 16.6 and 35 here. A phone has no frame, so
 * the row tightens instead of wrapping: 12px gaps; slimmer buttons under 390px; under
 * 360px Previous keeps only its arrow, still named "Previous".
 */
const SurveyNav: FC<SurveyNavProps> = ({
  canGoBack,
  canGoNext,
  hasAnswer,
  onPrevious,
  onNext,
  progress,
}) => (
  <nav className="flex items-center gap-3 border-t border-[rgba(22,16,33,0.09)] px-[18.4px] pb-[max(17.6px,env(safe-area-inset-bottom))] pt-[15px] sm:gap-5 sm:px-[35px] sm:pb-[16.6px]">
    <button
      type="button"
      onClick={onPrevious}
      disabled={!canGoBack}
      className="flex shrink-0 items-center gap-[6.4px] rounded-full border border-[rgba(22,16,33,0.09)] px-[17.6px] py-[8.6px] font-sans text-[14px] font-semibold leading-5 text-[#4a4458] transition-[background-color,opacity] hover:bg-[rgba(22,16,33,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-[0.32] max-[390px]:px-3"
    >
      <Chevron d="m15 18-6-6 6-6" />
      <span className="max-[360px]:sr-only">Previous</span>
    </button>

    <div className="min-w-0 flex-1">{progress}</div>

    <button
      type="button"
      onClick={onNext}
      disabled={!canGoNext}
      className={`flex shrink-0 items-center gap-[7.2px] rounded-full bg-[#e8511f] px-6 py-[11.5px] font-sans text-[15px] font-bold leading-[21px] text-white transition-[opacity,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none max-[390px]:px-4 ${
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
