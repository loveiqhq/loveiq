"use client";

import type { FC } from "react";

interface SurveyProgressProps {
  /** Zero-based position of the question on screen. */
  index: number;
  total: number;
}

const TOTAL_MINUTES = 15;

/**
 * The bar never starts empty. Mark, on the design (Figma, 2026-09-23): "Can the
 * progress bar not start at 0, but rather at 15%." The other 85% is spread over
 * the questions; the "n/N" count beside it stays the honest number.
 */
export const HEAD_START_PERCENT = 15;

export function progressPercent(index: number, total: number): number {
  if (total <= 0) return HEAD_START_PERCENT;
  const done = Math.min(Math.max(index, 0), total) / total;
  return HEAD_START_PERCENT + (100 - HEAD_START_PERCENT) * done;
}

export function minutesLeft(index: number, total: number): number {
  if (total <= 0) return 0;
  const remaining = Math.min(Math.max(total - index, 0), total);
  return Math.ceil((TOTAL_MINUTES * remaining) / total);
}

const ClockIcon: FC = () => (
  <svg
    aria-hidden
    className="h-[8.55px] w-[8.55px] shrink-0"
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

/** The card's bottom strip: "n/N | ~X min" over the orange bar (Figma 11303:228). */
const SurveyProgress: FC<SurveyProgressProps> = ({ index, total }) => {
  const percent = progressPercent(index, total);
  const position = Math.min(index + 1, total);
  const minutes = minutesLeft(index, total);

  return (
    // On a phone this strip is the screen's bottom edge, so it clears the home indicator.
    <div className="border-t border-[rgba(22,16,33,0.09)] px-[18.4px] pb-[max(17.6px,env(safe-area-inset-bottom))] pt-[15px] sm:px-[35px] sm:pb-[16.6px]">
      <div className="flex h-[23.6px] items-center gap-[7.12px] pl-[8.55px] font-sans text-[9.26px] font-semibold uppercase leading-[12.35px] tracking-[0.1em] text-[#a78bfa]">
        <span>
          {position}/{total}
        </span>
        {minutes > 0 && (
          <>
            <span aria-hidden className="h-[8.55px] w-px bg-[rgba(167,139,250,0.4)]" />
            <span className="flex items-center gap-[4.27px]">
              <ClockIcon />~{minutes} min
            </span>
          </>
        )}
      </div>

      <div
        role="progressbar"
        aria-label="Survey progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`Question ${position} of ${total}`}
        className="relative mt-[12.8px] h-2 rounded-[4px] bg-[rgba(22,16,33,0.09)]"
      >
        <div
          className="h-full rounded-[4px] bg-gradient-to-r from-[#fe6839] to-[#fe723b] transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff9450] shadow-[0_0_10px_3px_rgba(255,148,80,0.55)] transition-[left] duration-500 ease-out"
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  );
};

export default SurveyProgress;
