"use client";

import type { FC } from "react";

interface SurveyNavProps {
  canGoBack: boolean;
  canGoNext: boolean;
  hasAnswer: boolean;
  statusText: string;
  onPrevious: () => void;
  onNext: () => void;
}

const ChevronLeft: FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg
    aria-hidden
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const ChevronRight: FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg
    aria-hidden
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const SurveyNav: FC<SurveyNavProps> = ({
  canGoBack,
  canGoNext,
  hasAnswer,
  statusText,
  onPrevious,
  onNext,
}) => {
  return (
    <nav className="flex items-center justify-between gap-3">
      {/* Previous */}
      <button
        type="button"
        onClick={onPrevious}
        disabled={!canGoBack}
        className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 font-sans text-[14px] font-medium text-white/80 transition hover:bg-white/15 disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>

      {/* Center status */}
      <span className="hidden font-sans text-[14px] font-semibold text-white/30 sm:block">
        {statusText}
      </span>

      {/* Next */}
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        className={`flex items-center gap-1.5 rounded-full px-5 py-2.5 font-sans text-[14px] font-bold text-white transition ${
          hasAnswer
            ? "bg-gradient-to-r from-[#fe6839] to-[#ff8f6b] shadow-[0_4px_16px_rgba(254,104,57,0.3)] hover:shadow-[0_6px_20px_rgba(254,104,57,0.4)]"
            : "bg-gradient-to-r from-[#fe6839]/70 to-[#ff8f6b]/70 opacity-70"
        } disabled:pointer-events-none disabled:opacity-40`}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
};

export default SurveyNav;
