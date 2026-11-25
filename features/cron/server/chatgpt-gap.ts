/**
 * Has ChatGPT gone quiet? It is the one AI assistant that tags its links
 * (`utm_source=chatgpt.com`), so the visit log sees every click it sends that keeps the tag.
 * From 7 to 14 Oct 2026 it sent none for eight days, and we only found out a week later
 * (`CHATGPT_GAP`). anomaly-watcher asks every hour from 07:00 Berlin; each post goes out once.
 *
 * When to post scales with the volume: once the quiet days would come by chance less than
 * 1 time in 100 at the usual rate, and never before day 3. That is 3 days at 14 visits a
 * week, 4 at 9 and 5 at 7. A flat 3 days would raise a false alarm several times a year at
 * today's volume, and every few weeks in a slow month.
 *
 * Judged on whole Berlin days, the days `funnel_event.day` is written in. Untagged clicks
 * (no utm and, from ChatGPT, almost never a Referer) are invisible here, as they are to every
 * other count.
 */

import { addDays, dayRange, shortDate } from "@features/admin/server/ap/days";
import { CHATGPT_GAP } from "@features/admin/server/ap/filters";
import { fetchAllRows } from "@features/admin/server/supabase";

/** How ChatGPT's links name it: only chatgpt.com so far, the older spellings cost nothing. */
const CHATGPT_SOURCES = ["chatgpt.com", "chatgpt", "chat.openai.com"];

/** Post once the quiet days would come by chance less often than this... */
const CHANCE = 0.01;
/** ...and never before this many of them. */
const MIN_QUIET_DAYS = 3;
/** After the first post, a reminder every week for this many weeks; the last one says so. */
const REMINDERS = 8;
const REMIND_EVERY = 7;
/** The usual rate comes from up to this many days before the quiet ones... */
const USUAL_DAYS = 28;
/** ...and needs at least this many of them inside the read. */
const MIN_USUAL_DAYS = 7;
/** A comeback is still posted while the visits go on, for up to this many days. */
const BACK_WITHIN = 7;
/**
 * How far back a check reads: far enough that the usual days of every quiet run still being
 * reminded about lie inside it.
 */
export const CHATGPT_LOOKBACK_DAYS = 90;

export interface QuietRun {
  /** Its first quiet day. */
  from: string;
  days: number;
  /** It reaches the first day read, so it may have begun earlier. */
  capped: boolean;
}

export interface ChatgptGap {
  /** The Berlin day judged: yesterday, the last whole one. */
  day: string;
  /** ChatGPT visits on that day. */
  visits: number;
  /** Days in a row without a visit, ending on `day` (0 when it had visits). */
  streak: number;
  /** The quiet run a post is about: the current one, or on a comeback the one that ended. */
  run: QuietRun | null;
  /** Visits a week before that run, when at least a week of it was read. */
  usualPerWeek: number | null;
  /** Quiet days in a row needed before a post, at that rate. */
  needed: number | null;
  action: "alert" | "reminder" | "back" | null;
  /** The claim. A run keeps its key for each step, so a missed day catches up the next. */
  key: string | null;
  /** On a comeback: the first day back and the visits since. */
  back: { from: string; visits: number } | null;
  /** The last weekly reminder. */
  last: boolean;
}

/** Quiet days in a row ending on `day`, never counting back past `since`. */
function quietRun(counts: ReadonlyMap<string, number>, day: string, since: string): QuietRun {
  let d = day;
  while (d >= since && !counts.get(d)) d = addDays(d, -1);
  const from = addDays(d, 1);
  let days = 0;
  for (let x = from; x <= day; x = addDays(x, 1)) days += 1;
  return { from, days, capped: d < since };
}

/** Days in a row with visits ending on `day`, never counting back past `since`. */
function visitRun(counts: ReadonlyMap<string, number>, day: string, since: string): number {
  let days = 0;
  for (let d = day; d >= since && counts.get(d); d = addDays(d, -1)) days += 1;
  return days;
}

/** Visits a day over the days before `from` (up to 28, inside the read), or null under a week. */
function usualPerDay(
  counts: ReadonlyMap<string, number>,
  from: string,
  since: string
): number | null {
  const earliest = addDays(from, -USUAL_DAYS);
  let days = 0;
  let visits = 0;
  for (let d = earliest < since ? since : earliest; d < from; d = addDays(d, 1)) {
    days += 1;
    visits += counts.get(d) ?? 0;
  }
  return days >= MIN_USUAL_DAYS ? visits / days : null;
}

/** Quiet days whose chance at `perDay` visits a day falls under CHANCE, never fewer than 3. */
function quietDaysNeeded(perDay: number | null): number {
  if (perDay === null) return MIN_QUIET_DAYS;
  // The chance of n quiet days at a steady rate is e^(-rate*n).
  return Math.max(MIN_QUIET_DAYS, Math.ceil(Math.log(1 / CHANCE) / perDay));
}

/**
 * `counts` is ChatGPT visits per Berlin day (a missing day had none), read from `since`.
 */
export function chatgptGap(
  counts: ReadonlyMap<string, number>,
  day: string,
  since: string
): ChatgptGap {
  const current = quietRun(counts, day, since);
  const none: ChatgptGap = {
    day,
    visits: counts.get(day) ?? 0,
    streak: current.days,
    run: null,
    usualPerWeek: null,
    needed: null,
    action: null,
    key: null,
    back: null,
    last: false,
  };
  const about = (run: QuietRun, perDay: number | null, needed: number): ChatgptGap => ({
    ...none,
    run,
    usualPerWeek: perDay === null ? null : Math.round(perDay * 7),
    needed,
  });

  if (current.days > 0) {
    // Its start is unknown, and it is past every reminder anyway.
    if (current.capped) return { ...none, run: current };
    const perDay = usualPerDay(counts, current.from, since);
    const gap = about(current, perDay, quietDaysNeeded(perDay));
    const step = Math.floor((current.days - gap.needed!) / REMIND_EVERY);
    if (current.days < gap.needed! || step > REMINDERS) return gap;
    return step === 0
      ? { ...gap, action: "alert", key: `${current.from}:alert` }
      : {
          ...gap,
          action: "reminder",
          key: `${current.from}:week${step}`,
          last: step === REMINDERS,
        };
  }

  // A day with visits: did they end, within the last week, a quiet run worth a post?
  const visitDays = visitRun(counts, day, since);
  const backFrom = addDays(day, 1 - visitDays);
  const ended = quietRun(counts, addDays(backFrom, -1), since);
  if (visitDays > BACK_WITHIN || ended.days === 0) return none;
  const perDay = ended.capped ? null : usualPerDay(counts, ended.from, since);
  const gap = about(ended, perDay, quietDaysNeeded(perDay));
  if (ended.days < gap.needed!) return gap;
  let visitsSince = 0;
  for (let d = backFrom; d <= day; d = addDays(d, 1)) visitsSince += counts.get(d) ?? 0;
  return {
    ...gap,
    action: "back",
    key: `${backFrom}:back`,
    back: { from: backFrom, visits: visitsSince },
  };
}

/** The post and the notice for a gap: a headline, and a line under it (may be empty). */
export function chatgptGapText(gap: ChatgptGap): { headline: string; body: string } | null {
  const run = gap.run;
  if (!gap.action || !run) return null;
  const quietDays = dayRange(run.from, addDays(run.from, run.days - 1));
  const usual = gap.usualPerWeek === null ? "" : `Usually about ${gap.usualPerWeek} a week.`;
  const lines = (...parts: string[]) => parts.filter(Boolean).join(" ");

  if (gap.action === "alert") {
    const october = `${dayRange(CHATGPT_GAP.from, CHATGPT_GAP.to)} ${CHATGPT_GAP.to.slice(0, 4)}`;
    return {
      headline: `ChatGPT sent no visits for ${run.days} days (${quietDays})`,
      body: lines(
        usual,
        `The ${october} gap was on ChatGPT's side, not ours.`,
        "Check GA4 (AI Assistant) and PostHog before changing anything."
      ),
    };
  }
  if (gap.action === "reminder") {
    return {
      headline: `ChatGPT: still no visits, ${run.days} days now (${quietDays})`,
      body: lines(
        usual,
        gap.last ? "This is the last reminder: the next post comes when the visits are back." : ""
      ),
    };
  }
  const back = gap.back!;
  const howMany = `${back.visits} ${back.from === gap.day ? "on" : "since"} ${shortDate(back.from)}`;
  const howLong = run.capped
    ? `more than ${Math.floor(CHATGPT_LOOKBACK_DAYS / 7)} weeks`
    : `${run.days} days`;
  return { headline: `ChatGPT visits are back: ${howMany}, after ${howLong} with none`, body: "" };
}

/** ChatGPT's tagged visits per Berlin day from `from` to `to`. Throws when the read fails. */
export async function readChatgptVisits(from: string, to: string): Promise<Map<string, number>> {
  const query = new URLSearchParams({
    select: "day",
    event_type: "eq.unique_visitor",
    utm_source: `in.(${CHATGPT_SOURCES.map((s) => `"${s}"`).join(",")})`,
    // A full order, so the pages fetchAllRows reads neither repeat nor skip a row.
    order: "day.desc,visitor_id.asc",
  });
  query.append("day", `gte.${from}`);
  query.append("day", `lte.${to}`);

  const rows = await fetchAllRows<{ day: string }>(`/rest/v1/funnel_event?${query}`);
  // A failed read must never look like a quiet day: that would be a false alarm.
  if (!rows) throw new Error("chatgpt-gap: reading the visit log failed");

  const counts = new Map<string, number>();
  for (const { day } of rows) counts.set(day, (counts.get(day) ?? 0) + 1);
  return counts;
}
