/**
 * Has ChatGPT gone quiet? It is the one AI assistant that tags its links
 * (`utm_source=chatgpt.com`), so the visit log sees every click it sends that keeps the tag.
 * From 7 to 14 Oct 2026 its links carried no tag for eight days, so none were seen, and we only
 * found out a week later (`CHATGPT_GAP`). So a post says "no tagged visits": the tag can go
 * while the visits go on, as Direct. anomaly-watcher asks every hour from 07:00 Berlin; each
 * post goes out once.
 *
 * When to post scales with the volume: once the quiet days would come by chance less than
 * 3 times in 1,000 at the usual rate, and never before day 3. That is 3 days at 14 visits a
 * week, 5 at 9 or 10, 6 at 7 and 12 at one every other day. Run on the real weeks of 17 Aug
 * to 22 Nov 2026, resampled, it raises about 0.3 false alarms a year at 10 visits a week, 1.6
 * at 7 and 1.9 at 5, each with its "back" post (1 in 100 raised 1.7, 3.3 and 3.9). A ChatGPT
 * slower than about 1.5 visits a week would need more than 28 quiet days: its silence says
 * nothing, so it never posts, and a trickle measured inside an outage can't start a new one.
 *
 * A day with visits ends a quiet run too short to post about. Once it is long enough, only two
 * days with visits less than a week apart end it: a lone day can be a stray link (a bookmark, a
 * team test), and ending the run there would post "back", stop the reminders and measure the
 * next run's usual rate over the gap itself. Strays a week or more apart never end it. The run
 * keeps its start, its keys and the usual rate from before it.
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
const CHANCE = 0.003;
/** ...and never before this many of them. */
const MIN_QUIET_DAYS = 3;
/** ...and never when more than this many would be needed: that run never posts. */
const MAX_QUIET_DAYS = 28;
/** After the first post, a reminder every week for this many weeks; the last one says so. */
const REMINDERS = 8;
const REMIND_EVERY = 7;
/** The usual rate comes from this many days before the quiet ones (the read always holds them). */
const USUAL_DAYS = 28;
/** Two days with visits less than this many days apart end a quiet run; lone days are strays. */
const BACK_PAIR_DAYS = 7;
/**
 * The comeback can still be posted while the day judged is less than this many days after the
 * one that ended the run: a first try and six catch-ups.
 */
const BACK_WITHIN = 7;
/**
 * How many days a check judges, ending on the day judged. It reads the 28 days before them too
 * (`chatgptReadFrom`), so every run it judges has all of its usual days, and a run's rate and
 * the quiet days it needs never change as the window moves on.
 */
export const CHATGPT_LOOKBACK_DAYS = 90;

/** The first day a check reads: the 28 usual days before the first day it judges, `since`. */
export function chatgptReadFrom(since: string): string {
  return addDays(since, -USUAL_DAYS);
}

export interface QuietRun {
  /** Its first quiet day. */
  from: string;
  /** Days from `from`: to the day judged, or on a comeback to the day before its first visits. */
  days: number;
  /** It reaches the first day read, so it may have begun earlier. */
  capped: boolean;
  /**
   * Its days with visits once it was long enough to post about: lone ones are strays, and two
   * less than a week apart end it (the last two, on a comeback).
   */
  visitDays: string[];
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
  /** Visits a week over the 28 days before that run. */
  usualPerWeek: number | null;
  /** Quiet days in a row needed before a post, at that rate (Infinity past 28: it never posts). */
  needed: number | null;
  action: "alert" | "reminder" | "back" | null;
  /** The claim. A run keeps its key for each step, so a missed day catches up the next. */
  key: string | null;
  /** On a comeback: the two days with visits that ended the run, and their visits. */
  back: { days: [string, string]; visits: number } | null;
  /** The last weekly reminder. */
  last: boolean;
}

interface Run extends Omit<QuietRun, "days"> {
  perDay: number;
  needed: number;
}

/** Whole days from `from` to `to`. */
function daysFrom(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Visits a day over the 28 days before `from`, which every read holds (`chatgptReadFrom`). */
function usualPerDay(counts: ReadonlyMap<string, number>, from: string): number {
  let visits = 0;
  for (let d = addDays(from, -USUAL_DAYS); d < from; d = addDays(d, 1))
    visits += counts.get(d) ?? 0;
  return visits / USUAL_DAYS;
}

/** Quiet days whose chance at `perDay` visits a day falls under CHANCE, never fewer than 3. */
function quietDaysNeeded(perDay: number): number {
  // The chance of n quiet days at a steady rate is e^(-rate*n).
  const needed = Math.max(MIN_QUIET_DAYS, Math.ceil(Math.log(1 / CHANCE) / perDay));
  return needed > MAX_QUIET_DAYS ? Infinity : needed;
}

/**
 * `counts` is ChatGPT visits per Berlin day (a missing day had none), read from
 * `chatgptReadFrom(since)`; the days judged start on `since`.
 */
export function chatgptGap(
  counts: ReadonlyMap<string, number>,
  day: string,
  since: string
): ChatgptGap {
  // The days read, in order. A run starts on a day without visits, with the usual rate of the
  // days before it; `ended` is the last run long enough to post about that has ended.
  let run: Run | null = null;
  let ended: { run: Run; on: string } | null = null;
  for (let d = since; d <= day; d = addDays(d, 1)) {
    const visits = counts.get(d) ?? 0;
    if (!run) {
      if (visits) continue;
      const perDay = usualPerDay(counts, d);
      run = {
        from: d,
        capped: d === since,
        visitDays: [],
        perDay,
        needed: quietDaysNeeded(perDay),
      };
    }
    if (!visits) continue;
    if (daysFrom(run.from, d) < run.needed) {
      run = null;
      continue;
    }
    const prev = run.visitDays.at(-1);
    run.visitDays.push(d);
    if (prev && daysFrom(prev, d) < BACK_PAIR_DAYS) {
      ended = { run, on: d };
      run = null;
    }
  }

  let streak = 0;
  for (let d = day; d >= since && !counts.get(d); d = addDays(d, -1)) streak += 1;
  const none: ChatgptGap = {
    day,
    visits: counts.get(day) ?? 0,
    streak,
    run: null,
    usualPerWeek: null,
    needed: null,
    action: null,
    key: null,
    back: null,
    last: false,
  };
  const about = (r: Run, days: number): ChatgptGap => ({
    ...none,
    run: { from: r.from, days, capped: r.capped, visitDays: r.visitDays },
    usualPerWeek: Math.round(r.perDay * 7),
    needed: r.needed,
  });

  const current = run && about(run, daysFrom(run.from, day) + 1);
  if (run && current && !run.capped) {
    const days = current.run!.days;
    const step = Math.floor((days - run.needed) / REMIND_EVERY);
    if (days >= run.needed && step <= REMINDERS)
      return step === 0
        ? { ...current, action: "alert", key: `${run.from}:alert` }
        : {
            ...current,
            action: "reminder",
            key: `${run.from}:week${step}`,
            last: step === REMINDERS,
          };
  }
  if (ended && daysFrom(ended.on, day) < BACK_WITHIN) {
    const [first, second] = ended.run.visitDays.slice(-2) as [string, string];
    return {
      ...about(ended.run, daysFrom(ended.run.from, first)),
      action: "back",
      // The day that ended it: a capped run's `from` moves with the days read.
      key: `${ended.on}:back`,
      back: {
        days: [first, second],
        visits: (counts.get(first) ?? 0) + (counts.get(second) ?? 0),
      },
    };
  }
  if (!current) return none;
  // A capped run's start is unknown, and it is past every reminder anyway.
  return run!.capped ? { ...none, run: current.run } : current;
}

/** The post and the notice for a gap: a headline, and a line under it (may be empty). */
export function chatgptGapText(gap: ChatgptGap): { headline: string; body: string } | null {
  const run = gap.run;
  if (!gap.action || !run) return null;

  /** "one day only (6 Nov)", or "2 days only (6 Nov, 20 Nov)". */
  const onlyOn = (days: string[]) =>
    `${days.length === 1 ? "one day" : `${days.length} days`} only (${days.map(shortDate).join(", ")})`;

  if (gap.action === "back") {
    const [first, second] = gap.back!.days;
    const between = run.visitDays.slice(0, -2);
    const since = run.capped
      ? `in more than ${Math.floor(CHATGPT_LOOKBACK_DAYS / 7)} weeks`
      : `since ${shortDate(addDays(run.from, -1))}`;
    return {
      headline: `ChatGPT visits are back: ${gap.back!.visits} on ${shortDate(first)} and ${shortDate(second)}, ${between.length ? "after almost none" : "the first"} ${since}`,
      body: between.length ? `In between, tagged visits on ${onlyOn(between)}.` : "",
    };
  }

  const quietDays = dayRange(run.from, addDays(run.from, run.days - 1));
  const strays = run.visitDays;
  const none = strays.length ? "almost no" : "no";
  const usual = gap.usualPerWeek === null ? "" : `Usually about ${gap.usualPerWeek} a week.`;
  const strayDay = strays.length ? `Tagged visits on ${onlyOn(strays)}.` : "";
  const lines = (...parts: string[]) => parts.filter(Boolean).join(" ");

  if (gap.action === "alert") {
    const october = `${dayRange(CHATGPT_GAP.from, CHATGPT_GAP.to)} ${CHATGPT_GAP.to.slice(0, 4)}`;
    return {
      headline: `ChatGPT sent ${none} tagged visits for ${run.days} days (${quietDays})`,
      body: lines(
        usual,
        strayDay,
        `From ${october} its links carried no tag, so any visits it sent counted as Direct (a change on ChatGPT's side, not ours).`,
        "Check GA4 (AI Assistant) and PostHog before changing anything."
      ),
    };
  }
  return {
    headline: `ChatGPT: still ${none} tagged visits, ${run.days} days now (${quietDays})`,
    body: lines(
      usual,
      strayDay,
      gap.last ? "This is the last reminder: the next post comes when the visits are back." : ""
    ),
  };
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
