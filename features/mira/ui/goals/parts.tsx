"use client";

import { shortDate } from "@features/admin/server/ap/days";
import { addDays, weekStart, type Day, type Progress } from "../../server/goal-progress";
import type { Goal } from "./useGoals";

/**
 * The pieces the goals card and page share, in the calm chat's language: quiet white pills,
 * hairlines, Mira's plum for what was done, and one authored moment (the tick's check pops, and
 * the week's bar fills). Nothing here scolds: an empty week reads as the aim, never as a miss.
 */

/** The coaching topics goals belong to; today only Mira's (later coaches add theirs). */
const CHALLENGES: Record<string, string> = { "body-confidence": "Body confidence" };

/** On the go: neither done nor put away. */
export const onTheGo = (g: Goal) => !g.archived_at && !g.completed_at;

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** "3 days a week", "Every day", or none. */
export const aimLabel = (target: number | null) =>
  target === null ? "No set days" : target === 7 ? "Every day" : `${days(target)} a week`;

/**
 * This week in words: the aim before anything is ticked (unless `aimShown`: the goals page names
 * it under the goal already), never a count of what is missing.
 */
export function weekCaption(p: Progress, target: number | null, aimShown = false): string {
  if (target) {
    if (p.thisWeek >= target) return "Done for this week";
    if (p.thisWeek > 0) return `${p.thisWeek} of ${target} this week`;
    if (!aimShown) return aimLabel(target);
  }
  if (p.thisWeek > 0) return `${days(p.thisWeek)} this week`;
  return p.total > 0 ? "Not yet this week" : "Tick the days you do it";
}

export const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ap-purple focus-visible:ring-offset-2";

/**
 * Mira's challenge and any a goal names. No "Add a challenge" until a person can pick a second
 * one: it led to the coaches page, where none can be added yet (round-2 audit HAB-2).
 */
export function ChallengePills({ goals }: { goals: Goal[] }) {
  const ids = [...new Set(["body-confidence", ...goals.map((g) => g.challenge)])];
  return (
    <ul aria-label="Your challenges" className="flex flex-wrap items-center gap-2">
      {ids.map((id) => (
        <li
          key={id}
          className="inline-flex min-h-[32px] items-center rounded-full bg-ap-lilac px-3 text-[13px] font-semibold text-ap-violet"
        >
          {CHALLENGES[id] ?? id}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Did it today": a toggle that keeps its words (a screen reader hears it pressed or not), the
 * goal's own words added for anyone who can't see which row it sits in. `pop` only for a tick
 * made just now, so a page that loads with today ticked stays still.
 */
export function TickButton({
  goal,
  done,
  pop,
  busy = false,
  onToggle,
}: {
  goal: Goal;
  done: boolean;
  pop: boolean;
  /** Its tick is saving: useGoals ignores taps till then (aria-disabled keeps the focus). */
  busy?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-disabled={busy || undefined}
      aria-label={`Did it today: ${goal.text}`}
      onClick={onToggle}
      className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 self-start justify-self-start rounded-full border pl-2 pr-4 sm:col-start-2 sm:justify-self-end sm:row-span-2 sm:row-start-1 sm:self-center text-[14px] font-semibold transition-[background-color,border-color,transform] duration-200 active:scale-[0.97] ${FOCUS} ${
        done
          ? "border-transparent bg-ap-lilac text-ap-ink"
          : "border-ap-line bg-white text-ap-body hover:border-ap-mist hover:bg-ap-ground"
      }`}
    >
      <CheckDot done={done} pop={pop} />
      Did it today
    </button>
  );
}

/** The tick's circle: empty, or Mira's plum with a check that pops in when just ticked. */
export function CheckDot({ done, pop = false }: { done: boolean; pop?: boolean }) {
  return done ? (
    <span
      aria-hidden="true"
      className={`flex h-7 w-7 items-center justify-center rounded-full bg-ap-purple text-white ${pop ? "motion-safe:animate-mira-pop" : ""}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  ) : (
    <span aria-hidden="true" className="h-7 w-7 rounded-full border-[1.5px] border-ap-muted" />
  );
}

/**
 * This week: one segment per day aimed for (the board's bar), filled as the days are ticked,
 * and the week in words. Without an aim, the words alone.
 */
export function WeekLine({
  p,
  target,
  pop,
  aimShown = false,
}: {
  p: Progress;
  target: number | null;
  pop: boolean;
  aimShown?: boolean;
}) {
  const met = target !== null && p.thisWeek >= target;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {target ? (
        <span aria-hidden="true" className="flex w-[84px] shrink-0 gap-1">
          {Array.from({ length: target }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                i < p.thisWeek ? "bg-ap-purple" : "bg-ap-track"
              } ${pop && i === Math.min(p.thisWeek, target) - 1 ? "motion-safe:animate-mira-pop" : ""}`}
            />
          ))}
        </span>
      ) : null}
      <span
        key={met ? "met" : "open"}
        className={`text-[13px] ${met ? `inline-flex items-center gap-1 font-semibold text-ap-plum ${pop ? "motion-safe:animate-mira-in" : ""}` : "text-ap-muted"}`}
      >
        {met ? <SparkIcon /> : null}
        {weekCaption(p, target, aimShown)}
      </span>
    </div>
  );
}

/**
 * The last 8 weeks as tiny bars, oldest first: each week a slot (a soft track, fainter before the
 * goal), filled plum where the week's aim was met (any tick without one) and a softer lilac for
 * part of it. Labelled on screen, so it reads as weeks, never as a stray line; each week is also
 * written out for screen readers.
 */
export function WeekBars({ p, target, today }: { p: Progress; target: number | null; today: Day }) {
  const scale = target ?? Math.max(1, ...p.weeks.map((n) => n ?? 0));
  const thisWeek = weekStart(today);
  return (
    <div className="flex flex-col gap-1">
      <ol aria-label="Days ticked, last 8 weeks" className="flex h-8 items-end gap-[5px]">
        {p.weeks.map((n, i) => {
          const week = addDays(thisWeek, -7 * (p.weeks.length - 1 - i));
          const met = n !== null && n >= (target ?? 1);
          const height = n ? Math.max(8, Math.round((Math.min(n, scale) / scale) * 32)) : 0;
          return (
            <li
              key={week}
              className={`flex h-full w-[7px] items-end overflow-hidden rounded-full bg-ap-track ${n === null ? "opacity-50" : ""}`}
            >
              <span className="sr-only">
                {`Week of ${shortDate(week)}: ${n === null ? "before this goal" : days(n)}`}
              </span>
              <span
                aria-hidden="true"
                style={{ height }}
                className={`block w-full rounded-full ${met ? "bg-ap-purple" : "bg-ap-mist"}`}
              />
            </li>
          );
        })}
      </ol>
      <span aria-hidden="true" className="text-[11px] text-ap-muted">
        Last 8 weeks
      </span>
    </div>
  );
}

export function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

/** Mira's small spark (as on her welcome), for a week done and weeks in a row. */
export function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#bf66d9"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  );
}

/** A goal from the chat: a small target, Mira's mark for goals. */
export function TargetIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}
