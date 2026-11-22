"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { addDays } from "@features/admin/server/ap/days";
import { longDate, week, type JournalEntry, type WeekDot } from "@features/mira/journal";
import { ConfirmDelete } from "../kit";

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

/**
 * After a sheet closes, focus goes back to its opener (Modal does that). When a save replaced the
 * opener ("Do today’s check-in" becomes "Edit today’s check-in", "Choose a time" becomes
 * "Change"), focus would fall to the page: it goes to `to` instead, what replaced it.
 */
export function refocus(to: () => HTMLElement | null | undefined): void {
  window.requestAnimationFrame(() => {
    if (!document.activeElement || document.activeElement === document.body) to()?.focus();
  });
}

/**
 * After a row left a list (deleted, done, put away, brought back), focus goes to the first button
 * of the row now in its place, or of the last row when it was the end, else to `fallback` (the
 * list's heading): never to the page (round-3 R3-HAB-4).
 */
export function refocusRow(
  list: RefObject<HTMLElement | null>,
  index: number,
  fallback: () => HTMLElement | null | undefined
): void {
  refocus(() => {
    const rows = list.current?.children;
    const row = rows?.[Math.min(index, rows.length - 1)];
    return row?.querySelector<HTMLElement>("button") ?? fallback();
  });
}

/** A heading focus can land on (tabIndex -1), by id: refocus's and refocusRow's fallbacks. */
export const byId = (id: string) => document.getElementById(id);

/**
 * A deletion asked first, as everywhere in Mira (kit ConfirmDelete, round-2 UX-9): the button,
 * then the question opening on "Keep it", which puts focus back on the button (A11Y-5). `run`
 * answers null when done, or the message to show.
 */
export function AskFirst({
  label,
  name,
  question,
  action,
  className,
  run,
}: {
  label: string;
  /** The button's whole name, when its words alone don't say what goes. */
  name?: string;
  question: string;
  action?: string;
  className: string;
  run: () => Promise<string | null>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    const failed = await run();
    setBusy(false);
    if (failed) setError(failed);
    else setAsking(false);
  }
  return asking ? (
    <ConfirmDelete
      question={question}
      action={action}
      busy={busy}
      error={error}
      onConfirm={() => void confirm()}
      onKeep={() => {
        setAsking(false);
        refocus(() => opener.current);
      }}
    />
  ) : (
    <button
      ref={opener}
      type="button"
      aria-label={name}
      onClick={() => setAsking(true)}
      className={className}
    >
      {label}
    </button>
  );
}

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
        className={`flex h-[30px] w-[52px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ap-purple group-aria-disabled:opacity-60 ${checked ? "bg-ap-purple" : "bg-ap-muted/75"}`}
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
  done: "bg-ap-purple/10 text-ap-purple",
  today: "bg-ap-purple text-white",
  open: "border-2 border-dashed border-ap-lavender bg-white",
  none: "bg-ap-track text-ap-muted",
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
            className={`whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.06em] sm:text-[11px] ${d.day === today ? "text-ap-link" : "text-ap-muted"}`}
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
