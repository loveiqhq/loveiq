import { addDays, shortDate } from "@features/admin/server/ap/days";
import { localDay } from "./server/goal-progress";

/**
 * The daily journal's rules, shared by the browser, the API and AP › Mira (no server imports).
 * Days are the person's own calendar days, "YYYY-MM-DD".
 */

/**
 * The areas of life a check-in rates, one tap each, 1 (very low) to 5 (very good). Kept to four so
 * it takes seconds; worded for anyone, partnered or not (Mark's Home board: "a few taps across the
 * areas of your life"). Each is a column of mira_journal_entry.
 */
export const AREAS = [
  { id: "mood", label: "Mood", hint: "How you feel overall" },
  { id: "body", label: "Body", hint: "At home in your body" },
  { id: "closeness", label: "Closeness", hint: "Feeling close to someone" },
  { id: "energy", label: "Energy", hint: "Rest and get-up-and-go" },
] as const;
export type AreaId = (typeof AREAS)[number]["id"];

/** The scale's words, 1 to 5. */
export const SCALE = ["Very low", "Low", "Okay", "Good", "Very good"] as const;

/** A one-line note, at most this long (the table's check). */
export const NOTE_MAX = 280;

/** What one read brings back, in days: a year and a bit, enough for every streak the beta can have. */
export const DAYS_READ = 400;

export type JournalEntry = { day: string; note: string | null } & Record<AreaId, number | null>;

/** Who may read the journal besides the person: nobody, Mira the ratings, Mira the notes too. */
export type JournalShare = "off" | "scores" | "notes";

const HOUR_MS = 3_600_000;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * A new check-in is for the person's today, which the browser sends: no earlier than yesterday in
 * their zone (a check-in begun before their midnight), so a tab left open for days can't make one
 * for a day long gone, and no later than a day already begun somewhere (UTC+14: a traveller's
 * browser may be ahead of the zone on file). An existing entry can be edited on any day.
 * `restore`: an entry another tab or device deleted while this one edited it, put back on the
 * second Save the sheet asked for (R3-HAB-1): any day the journal loads (DAYS_READ, a day's slack
 * for a zone ahead of UTC), never an older one.
 */
export function canStart(day: string, now: Date, timeZone: string, restore = false): boolean {
  const from = addDays(localDay(now, timeZone), restore ? -DAYS_READ - 1 : -1);
  return day >= from && day <= utcDay(now.getTime() + 14 * HOUR_MS);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A day's weekday, 0 for Sunday. */
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export type WeekDot = {
  day: string;
  /** "Mon", or "Today"; `name` is the full word, for screen readers. */
  label: string;
  name: string;
  /** done: checked in; none: no check-in (never called "missed"); open/today: today, to do/done. */
  state: "done" | "none" | "open" | "today";
};

/** The seven days ending today, oldest first: the Home card's dots. */
export function week(days: Iterable<string>, today: string): WeekDot[] {
  const done = new Set(days);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    const name = day === today ? "Today" : WEEKDAYS[weekday(day)]!;
    const state =
      day === today ? (done.has(day) ? "today" : "open") : done.has(day) ? "done" : "none";
    return { day, label: day === today ? name : name.slice(0, 3), name, state };
  });
}

export type AreaPattern = {
  id: AreaId;
  label: string;
  /** The last 28 days' ratings, oldest first, null where there is none: the small chart. */
  days: Array<number | null>;
  /** The average over the last 7 days and how many ratings it has; the 7 days before's average. */
  avg: number | null;
  n: number;
  before: number | null;
  /** The pattern in words: the chart's text for everyone, screen readers included. */
  summary: string;
};

/** Less than this between two weeks' averages is "about the same". */
const SAME_WITHIN = 0.3;
/** A week needs this many ratings before it is compared with another. */
const COMPARE_FROM = 3;

const average = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/** Each area over the last weeks, for the journal page. */
export function patterns(entries: JournalEntry[], today: string): AreaPattern[] {
  const byDay = new Map(entries.map((e) => [e.day, e]));
  return AREAS.map(({ id, label }) => {
    const days = Array.from(
      { length: 28 },
      (_, i) => byDay.get(addDays(today, i - 27))?.[id] ?? null
    );
    const rated = (from: number) =>
      days.slice(from, from + 7).filter((v): v is number => v !== null);
    const last = rated(21);
    const prev = rated(14);
    const avg = average(last);
    const before = average(prev);
    let summary = "No rating in the last 7 days.";
    if (avg !== null) {
      const n = last.length;
      summary = `${avg.toFixed(1)} out of 5 on average over the last 7 days (${n} check-in${n === 1 ? "" : "s"})`;
      if (n >= COMPARE_FROM && prev.length >= COMPARE_FROM && before !== null) {
        const diff = avg - before;
        summary +=
          Math.abs(diff) < SAME_WITHIN
            ? ", about the same as the 7 days before."
            : `, ${diff > 0 ? "higher" : "lower"} than the 7 days before (${before.toFixed(1)}).`;
      } else summary += ".";
    }
    return { id, label, days, avg, n: last.length, before, summary };
  });
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Saturday 21 November", spelt out (ICU builds disagree on dates). */
export function longDate(day: string): string {
  const [, m = 1, d = 1] = day.split("-").map(Number);
  return `${WEEKDAYS[weekday(day)]} ${d} ${MONTHS[m - 1]}`;
}

/** "Sat 21 Nov". */
export const dayLabel = (day: string) => `${WEEKDAYS[weekday(day)]!.slice(0, 3)} ${shortDate(day)}`;

/**
 * The journal as Mira's context, only while the person lets her read it ("Let Mira read my
 * journal"): the last 7 days' ratings, oldest first, and their notes only with the second choice.
 * Null when it is off or there is nothing in those days.
 */
export function forMira(
  entries: JournalEntry[],
  share: JournalShare,
  today: string
): string | null {
  if (share === "off") return null;
  const from = addDays(today, -6);
  const recent = entries
    .filter((e) => e.day >= from && e.day <= today)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (!recent.length) return null;
  const lines = recent.map((e) => {
    const rated = AREAS.filter((a) => e[a.id] !== null).map((a) => `${a.id} ${e[a.id]}`);
    const note = share === "notes" && e.note ? ` Their note: ${JSON.stringify(e.note)}` : "";
    return `- ${dayLabel(e.day)}: ${rated.join(", ")}.${note}`;
  });
  return [
    "THEIR DAILY JOURNAL",
    `They chose to let you read their journal check-ins from the last 7 days${share === "notes" ? ", with the line they wrote" : ""}. Each area is rated 1 (very low) to 5 (very good): mood (how they feel overall), body (how at home they feel in their body), closeness (with a partner, friends or themselves), energy (rest, sleep, get-up-and-go).`,
    "Bring it in only when it helps the conversation, gently and in your own words: notice patterns with them, never treat a rating as a score to raise, never diagnose from it, and don't mention days without a check-in. Your rules and safety rails apply to what they wrote here too.",
    ...lines,
  ].join("\n");
}

/**
 * Days in a row with a check-in, up to today, or up to yesterday while today is still open, so a
 * check-in later today never reads as a broken streak.
 */
export function streak(days: Iterable<string>, today: string): number {
  const done = new Set(days);
  let day = done.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (done.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
