"use client";

import type { FC } from "react";

interface SurveyHeaderProps {
  chapter: string;
  progress: number;
  onPause: () => void;
}

const TOTAL_MINUTES = 15;

const SurveyHeader: FC<SurveyHeaderProps> = ({ chapter, progress, onPause }) => {
  const minutesLeft = Math.ceil((TOTAL_MINUTES * (100 - progress)) / 100);

  return (
    <header className="flex flex-col gap-4 px-1">
      {/* Top row: chapter + pause */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#a78bfa]" />
          <span className="font-sans text-[12px] font-semibold uppercase tracking-widest text-[#a78bfa]">
            {chapter}
          </span>
        </div>
        <button
          type="button"
          onClick={onPause}
          className="rounded-full border border-white/10 px-4 py-1.5 font-sans text-[12px] font-medium text-white/50 transition hover:border-white/20 hover:text-white/70"
        >
          Pause / Exit
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-widest text-white/30">
          Progress
        </span>
        <div className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#a78bfa] transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progress, 2)}%` }}
          />
        </div>
        <span className="min-w-[2.5rem] text-right font-sans text-[12px] font-semibold text-white/40">
          {progress}%
        </span>
        {progress < 100 && (
          <span className="font-sans text-[11px] text-white/25">· ∼ {minutesLeft} min left</span>
        )}
      </div>
    </header>
  );
};

export default SurveyHeader;
