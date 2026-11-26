"use client";

import type { FC } from "react";
import { step, useTrackPosition } from "./usePainTrack";
import { PP_FOCUS } from "./ppStyles";

const Chevron: FC<{ back?: boolean }> = ({ back }) => (
  <svg
    aria-hidden
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={back ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
  </svg>
);

const ARROW = `flex h-11 w-11 items-center justify-center rounded-full border border-solid border-[#e9e6ee] bg-white text-[#161021] shadow-[0_2px_5px_rgba(20,15,33,0.05)] transition-[transform,opacity] duration-200 ease-[cubic-bezier(.16,1,.3,1)] enabled:hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none ${PP_FOCUS}`;

/** From lg: back and on, one pattern at a time. */
const PPainPointArrows: FC<{ trackId: string }> = ({ trackId }) => {
  const { atStart, atEnd } = useTrackPosition(trackId);
  return (
    <div className="hidden flex-none items-center gap-3 lg:flex">
      <button
        type="button"
        aria-label="Previous pattern"
        aria-controls={trackId}
        disabled={atStart}
        onClick={() => step(trackId, -1)}
        className={ARROW}
      >
        <Chevron back />
      </button>
      <button
        type="button"
        aria-label="Next pattern"
        aria-controls={trackId}
        disabled={atEnd}
        onClick={() => step(trackId, 1)}
        className={ARROW}
      >
        <Chevron />
      </button>
    </div>
  );
};

export default PPainPointArrows;
