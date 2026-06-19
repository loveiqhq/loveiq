"use client";

import type { FC } from "react";
import { useSurveyTheme } from "./SurveyThemeContext";

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

const SurveyNav: FC<SurveyNavProps> = ({ canGoBack, canGoNext, hasAnswer, onPrevious, onNext }) => {
  const white = useSurveyTheme() === "white";
  return (
    <nav className="flex items-center justify-between gap-3">
      {/* Previous */}
      <button
        type="button"
        onClick={onPrevious}
        disabled={!canGoBack}
        className={`flex items-center gap-1.5 rounded-full border px-5 py-2.5 font-sans text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-30 ${
          white
            ? "border-black/15 bg-black/[0.04] text-[#4a4458] hover:bg-black/[0.07] focus-visible:ring-offset-white"
            : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 focus-visible:ring-offset-[#0a0510]"
        }`}
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>

      {/* Center status — hidden */}

      {/* Next */}
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        className={`flex items-center gap-1.5 rounded-full px-6 py-2.5 font-sans text-[14px] font-bold text-white transition-[opacity,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe6839]/60 focus-visible:ring-offset-2 ${
          white ? "focus-visible:ring-offset-white" : "focus-visible:ring-offset-[#0a0510]"
        } ${
          hasAnswer
            ? "bg-gradient-to-r from-[#fe6839] to-[#ff8f6b] shadow-[0_4px_16px_rgba(254,104,57,0.25)] hover:shadow-[0_6px_20px_rgba(254,104,57,0.35)]"
            : "bg-gradient-to-r from-[#fe6839]/60 to-[#ff8f6b]/60 opacity-60"
        } disabled:pointer-events-none disabled:opacity-40`}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
};

export default SurveyNav;
