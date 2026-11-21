"use client";

import type { ReactNode } from "react";
import { addDays } from "@features/admin/server/ap/days";
import { longDate, week, type JournalEntry, type WeekDot } from "@features/mira/journal";

/** The pieces the journal's screens share: the switch, the week's dots, a day's name. */

const CHECK = "M20 6L9 17l-5-5";

export function Icon({ path, className = "" }: { path: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

export const ARROW = "M5 12h14M13 6l6 6-6 6";

/** The reminder's time when it is first switched on: an evening check-in. */
export const DEFAULT_REMINDER = "20:00";
export { CHECK };

/**
 * The board's switch (52 × 30, plum when on) inside a 44 px tall target. Its accessible name is
 * its own text (`label`) or the element `labelledBy` names.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  labelledBy,
  describedBy,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  labelledBy?: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      // Not `disabled` while saving: that would drop keyboard focus. Taps wait instead.
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onChange(!checked)}
      className="group inline-flex min-h-[44px] shrink-0 items-center gap-3 text-left text-[15px] text-ap-ink outline-none aria-disabled:cursor-wait"
    >
      <span
        aria-hidden="true"
        className={`flex h-[30px] w-[52px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ap-purple group-aria-disabled:opacity-60 ${checked ? "bg-ap-purple" : "bg-[#857f8f]"}`}
      >
        <span
          className={`h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(22,16,33,0.25)] transition-transform duration-200 ease-out motion-reduce:transition-none ${checked ? "translate-x-[22px]" : ""}`}
        />
      </span>
      {label}
    </button>
  );
}

const DOT: Record<WeekDot["state"], string> = {
  done: "bg-[#795fc81a] text-ap-purple",
  today: "bg-ap-purple text-white",
  open: "border-2 border-dashed border-ap-lavender bg-white",
  none: "bg-ap-track text-ap-quiet",
};
const SAID: Record<WeekDot["state"], string> = {
  done: "checked in",
  today: "checked in",
  open: "not yet",
  none: "no check-in",
};

/**
 * The seven days ending today. A day without a check-in is a soft grey dash, never a red mark:
 * the dots show a week taking shape, not a test. `bloom` lets today's dot fill in with the save.
 */
export function WeekDots({
  days,
  today,
  bloom = false,
}: {
  days: Iterable<string>;
  today: string;
  bloom?: boolean;
}) {
  return (
    <ol aria-label="Your last seven days" className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {week(days, today).map((d) => (
        <li
          key={d.day}
          aria-label={`${d.name}: ${SAID[d.state]}`}
          className="flex min-w-0 flex-col items-center gap-1.5"
        >
          <span
            aria-hidden="true"
            className={`flex aspect-square w-full max-w-[44px] items-center justify-center rounded-[12px] sm:rounded-[14px] ${DOT[d.state]} ${bloom && d.state === "today" ? "motion-safe:animate-mira-pop" : ""}`}
          >
            {d.state === "done" || d.state === "today" ? (
              <Icon path={CHECK} className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            ) : d.state === "none" ? (
              <Icon path="M8 12h8" className="h-4 w-4" />
            ) : null}
          </span>
          <span
            aria-hidden="true"
            className={`whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.06em] sm:text-[11px] ${d.day === today ? "text-[#561dbd]" : "text-ap-muted"}`}
          >
            {d.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** "Today", "Yesterday" or "Wednesday 18 November". */
export function dayName(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return longDate(day);
}

/** Check-ins in the seven days ending today. */
export function thisWeek(entries: JournalEntry[], today: string): number {
  const from = addDays(today, -6);
  return entries.filter((e) => e.day >= from && e.day <= today).length;
}

/** A quiet block while the journal loads. */
export function Skeleton({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-xl bg-ap-track motion-safe:animate-pulse ${className}`}
    />
  );
}

/**
 * Journal content stays out of the analytics recordings, unlike the chat: entries are private by
 * default. Put this class AND data-clarity-mask="true" on anything that shows ratings or notes
 * (PostHog leaves out a ph-no-capture element, Clarity masks the other).
 */
export const UNRECORDED = "ph-no-capture";
