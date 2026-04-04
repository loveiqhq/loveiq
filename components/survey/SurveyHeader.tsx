"use client";

import type { FC } from "react";

interface SurveyHeaderProps {
  progress: number;
  onPause: () => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
}

const TOTAL_MINUTES = 15;

const PauseIcon: FC = () => (
  <svg
    aria-hidden
    className="h-2.5 w-2.5"
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <line x1="3" y1="1" x2="3" y2="9" />
    <line x1="7" y1="1" x2="7" y2="9" />
  </svg>
);

const ClockIcon: FC = () => (
  <svg
    aria-hidden
    className="h-3 w-3"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const SurveyHeader: FC<SurveyHeaderProps> = ({
  progress,
  onPause,
  autoAdvance,
  onToggleAutoAdvance,
}) => {
  const minutesLeft = Math.ceil((TOTAL_MINUTES * (100 - progress)) / 100);

  return (
    <header className="flex flex-col gap-6">
      {/* Auto-advance toggle + Pause button — top right */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onToggleAutoAdvance}
          className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 font-sans text-[12px] font-medium text-white/50 transition hover:border-white/20 hover:text-white/60"
          aria-pressed={autoAdvance}
          title={autoAdvance ? "Auto-advance is on" : "Auto-advance is off"}
        >
          <span
            className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors duration-200 ${
              autoAdvance ? "bg-[#a78bfa]" : "bg-white/15"
            }`}
          >
            <span
              className={`inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
                autoAdvance ? "translate-x-[16px]" : "translate-x-[2px]"
              }`}
            />
          </span>
          <span className="hidden sm:inline">Auto</span>
        </button>
        <button
          type="button"
          onClick={onPause}
          className="flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-1.5 font-sans text-[13px] font-medium text-white/50 transition hover:border-white/20 hover:text-white/60"
        >
          <PauseIcon />
          Pause
        </button>
      </div>

      {/* Progress row + bar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-sans text-[13px] font-semibold uppercase tracking-[0.1em] text-white/60">
            Progress
          </span>

          {/* Purple pill with percentage + clock + time */}
          <div className="flex items-center gap-2.5 rounded-full border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.1)] px-3.5 py-1">
            <span className="font-sans text-[10px] font-semibold uppercase tracking-[1px] text-[#a78bfa] sm:text-[13px] sm:tracking-[0.1em]">
              {progress}%
            </span>
            {progress < 100 && (
              <>
                <div className="h-3 w-px bg-[rgba(167,139,250,0.4)]" />
                <div className="flex items-center gap-1.5 text-[#a78bfa]">
                  <ClockIcon />
                  <span className="font-sans text-[10px] font-semibold uppercase tracking-[1px] sm:text-[13px] sm:tracking-[0.1em]">
                    ~{minutesLeft} min
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-[6px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#a78bfa] shadow-[0_0_10px_rgba(167,139,250,0.4)] transition-all duration-500 ease-out"
            style={{ width: `${Math.max(progress, 1)}%` }}
          />
        </div>
      </div>
    </header>
  );
};

export default SurveyHeader;
