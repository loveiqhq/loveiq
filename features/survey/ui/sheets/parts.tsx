"use client";

import { useEffect, useRef, type CSSProperties, type FC, type ReactNode } from "react";
import { KEEP_GOING } from "@features/survey/surveySheetsCopy";
import { prefersReducedMotion, SheetButton } from "./SurveySheetShell";

/** The boards' gradient for words (105deg), clipped to the text. */
export const GRADIENT_TEXT: CSSProperties = {
  backgroundImage: "linear-gradient(105deg, #fe6839 0%, #bf66d9 55%, #958ef6 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
};

/** The brand gradient as a 2px ring around a pale tile (the boards' icon tiles). */
export const GRADIENT_RING: CSSProperties = {
  background:
    "linear-gradient(#fcf9ff, #fcf9ff) padding-box, linear-gradient(135deg, #fe6839 0%, #bf66d9 50%, #958ef6 100%) border-box",
};

/** A delay for the motion classes in sheets-motion.css. */
export const delay = (ms: number): CSSProperties =>
  ({ "--sheet-delay": `${ms}ms` }) as CSSProperties;

/** A group's place in a sheet's entrance (`.sheet-in`). */
export const order = (i: number): CSSProperties => ({ "--sheet-i": i }) as CSSProperties;

/**
 * A phrase in the brand gradient. With `inkAt`, it starts in ink and the gradient shows
 * through at that moment (`.sheet-ink`): the sheet's one coloured beat.
 */
export const GradientText: FC<{ children: ReactNode; inkAt?: number; italic?: boolean }> = ({
  children,
  inkAt,
  italic = false,
}) => (
  <span
    className={`font-semibold text-transparent ${italic ? "-mr-[0.06em] pr-[0.06em] italic" : ""} ${
      inkAt === undefined ? "" : "sheet-ink"
    }`}
    style={inkAt === undefined ? GRADIENT_TEXT : { ...GRADIENT_TEXT, ...delay(inkAt) }}
  >
    {children}
  </span>
);

/** The boards' 32px tile with the gradient ring, holding a small icon. */
export const IconTile: FC<{ children: ReactNode; label?: string; className?: string }> = ({
  children,
  label,
  className = "",
}) => (
  <div
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    className={`flex h-8 w-8 flex-none items-center justify-center rounded-full border-2 border-solid border-transparent text-[#3a2a55] ${className}`}
    style={GRADIENT_RING}
  >
    {children}
  </div>
);

/**
 * How long a share takes to count up, and when it starts. Research gave 600ms from 300ms;
 * Mark's review (12 Nov): "have the stats animate slightly more slowly", so 1.2s from 400ms.
 */
export const COUNT_MS = 1200;
export const COUNT_AT_MS = 400;

/** The house curve's feel (cubic-bezier(0.16, 1, 0.3, 1)), close enough for a counter. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A percentage that counts up from 0 once, writing the digits straight to the page (no
 * render per frame). The width of the final value is kept from the start so the sentence
 * never re-wraps (proportional figures, as the board sets the number), a screen reader hears only the final value, and under reduced motion the
 * value simply stands.
 */
export const CountUpPercent: FC<{ value: number; ms?: number; at?: number }> = ({
  value,
  ms = COUNT_MS,
  at = COUNT_AT_MS,
}) => {
  const digits = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = digits.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof window.requestAnimationFrame !== "function") {
      el.textContent = `${value}%`;
      return;
    }
    el.textContent = "0%";
    let frame = 0;
    let start = 0;
    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / ms);
        el.textContent = `${Math.round(value * easeOut(t))}%`;
        if (t < 1) frame = window.requestAnimationFrame(step);
      };
      frame = window.requestAnimationFrame(step);
    }, at);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      el.textContent = `${value}%`;
    };
  }, [value, ms, at]);
  return (
    <span className="relative inline-block font-semibold">
      <span className="sr-only">{`${value}%`}</span>
      {/* Holds the final width; the counting digits sit over it. */}
      <span aria-hidden className="invisible">
        {`${value}%`}
      </span>
      <span
        ref={digits}
        aria-hidden
        data-count-up
        className="absolute inset-0 text-transparent"
        style={GRADIENT_TEXT}
      >
        {`${value}%`}
      </span>
    </span>
  );
};

/** Mark's "Keep going": final from the first frame, never late, faded in or disabled. */
export const KeepGoingButton: FC<{ onPress: () => void; className?: string }> = ({
  onPress,
  className = "",
}) => (
  <SheetButton
    data-sheet-keep-going
    onPress={onPress}
    className={`flex h-[46px] w-full flex-none items-center justify-center rounded-full bg-[#6b5b95] font-sans text-[15px] font-bold leading-[normal] text-white outline-none focus-visible:ring-2 focus-visible:ring-[#6b5b95]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${className}`}
  >
    {KEEP_GOING}
  </SheetButton>
);
