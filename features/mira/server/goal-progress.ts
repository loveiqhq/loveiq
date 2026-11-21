/**
 * Challenges & goals: a goal's days and weeks, as the person lives them. A tick is a calendar day
 * in their own time zone (mira_goal_log.day), weeks run Monday to Sunday, and the browser, the
 * goals API and Mira's context all count them the same way. Pure: safe in the browser too.
 */

/** A calendar day in the person's own time zone, "YYYY-MM-DD". */
export type Day = string;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const fromUtc = (ms: number): Day => new Date(ms).toISOString().slice(0, 10);
const toUtc = (day: Day) => Date.parse(`${day}T00:00:00Z`);

export const addDays = (day: Day, n: number): Day => fromUtc(toUtc(day) + n * DAY_MS);
/** Whole days from `from` to `to`. */
export const daysBetween = (from: Day, to: Day): number =>
  Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

/** The day an instant falls on in a time zone (the runtime's own when none is given, UTC when unknown). */
export function localDay(at: Date, timeZone?: string): Day {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
  } catch {
    return fromUtc(at.getTime());
  }
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The Monday that starts the day's week. */
export function weekStart(day: Day): Day {
  return addDays(day, -((new Date(toUtc(day)).getUTCDay() + 6) % 7));
}

/**
 * A tick may only be for "today" somewhere on Earth right now (UTC−12 to UTC+14): the browser
 * sends its own day, and no other day can be filled in or rewritten.
 */
export function isTickableDay(day: string, now: Date): boolean {
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(day) ? toUtc(day) : NaN;
  if (Number.isNaN(ms) || fromUtc(ms) !== day) return false; // "2026-02-30" is no day
  const t = now.getTime();
  return day >= fromUtc(t - 12 * HOUR_MS) && day <= fromUtc(t + 14 * HOUR_MS);
}

export type Progress = {
  /** Days ticked this week (Monday to Sunday), and whether today is one. */
  thisWeek: number;
  doneToday: boolean;
  /** Days ticked in each of the last weeks, oldest first, this week last; null before the goal. */
  weeks: Array<number | null>;
  /**
   * Weeks in a row that met the weekly target (any tick, without one), up to this week. This
   * week counts once it is met, and until then the run to last week stands: no week is "missed"
   * before it is over.
   */
  streak: number;
  /** Every day ticked since the goal was set: it only ever grows. */
  total: number;
  /** The newest day ticked. */
  last: Day | null;
};

/** One goal's progress on `today`, from the days it was ticked and the day it was set (`since`). */
export function progress(
  goal: { days: Day[]; target: number | null; since: Day },
  today: Day,
  weeks = 8
): Progress {
  const perWeek = new Map<Day, number>();
  for (const d of goal.days) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
  const count = (week: Day) => perWeek.get(week) ?? 0;
  const met = (week: Day) => count(week) >= (goal.target ?? 1);
  const now = weekStart(today);
  const first = weekStart(goal.since);

  let streak = 0;
  let week = met(now) ? now : addDays(now, -7);
  while (met(week)) {
    streak++;
    week = addDays(week, -7);
  }
  return {
    thisWeek: count(now),
    doneToday: goal.days.includes(today),
    weeks: Array.from({ length: weeks }, (_, i) => {
      const w = addDays(now, -7 * (weeks - 1 - i));
      return w < first ? null : count(w);
    }),
    streak,
    total: goal.days.length,
    last: goal.days.reduce<Day | null>((a, d) => (a === null || d > a ? d : a), null),
  };
}
