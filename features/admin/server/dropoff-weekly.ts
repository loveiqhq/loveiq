/**
 * Each survey question's drop-off, week by week, for the Notion KPI page
 * "Survey Drop-off Rate per Question %". Eman decided on 2026-10-11 that the
 * drill-down lives there, as a picture refreshed daily, rather than on an admin
 * page; the morning message links to it.
 *
 * The measure is the KPI page's own: `get_survey_friction` -> `by_question`,
 * per question id. Of the people who reached a question, the share whose last
 * survey step EVER was on it and who never finished. Not abandon events (every
 * tab switch sends one) and not screen positions (they shift per person); see
 * the headers of migrations 20261004171500 and 20261004193000.
 */
import { supabaseFetch } from "@features/admin/server/supabase";
import { surveyQuestionNames } from "@features/admin/server/friction-metrics";
import { HIDDEN_QIDS } from "@features/survey/questionFlags";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";
import { surveyQuestions } from "@/data/survey-data";

/** 📊 KPI › Survey Drop-off Rate per Question %. */
export const DROPOFF_KPI_PAGE_ID = "35500a24-0f11-4911-92dd-ff15ff499d1d";
export const DROPOFF_KPI_URL = "https://www.notion.so/35500a240f11491192ddff15ff499d1d";

/** Fewer people than this reached the question that week: no rate, a blank cell. */
export const DROPOFF_FLOOR = 20;

/**
 * Survey events were consent-gated until 18 Sep 2026 (~09:46 UTC), so the week
 * of 14 Sep is missing people. The first Monday with every survey tracked.
 */
export const FIRST_TRACKED_MONDAY = "2026-09-21";

const MAX_WEEKS = 8;

export interface DropoffWeek {
  /** Column header: the Monday, "21 Sep". */
  label: string;
  since: Date;
  until: Date;
  /** The week in progress, counted through yesterday. */
  partial: boolean;
}

/** `YYYY-MM-DD` plus n days, on the calendar (no time zone involved). */
function addDays(day: string, n: number): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "21 Sep". Spelled out here because ICU builds disagree ("Sep" vs "Sept"). */
export function shortDate(day: string): string {
  const [, m = 1, d = 1] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * Up to eight complete Monday-to-Sunday weeks (Berlin days), oldest first, then
 * the week in progress through yesterday. Through yesterday, not now: someone
 * halfway through the survey at this minute would otherwise count as a quit.
 */
export function dropoffWeeks(now: Date = new Date()): DropoffWeek[] {
  const today = reportingDay(now);
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = addDays(today, -weekday);
  const weeks: DropoffWeek[] = [];
  for (let i = MAX_WEEKS; i >= 1; i--) {
    const monday = addDays(thisMonday, -7 * i);
    if (monday < FIRST_TRACKED_MONDAY) continue;
    weeks.push({
      label: shortDate(monday),
      since: reportingDayStart(monday),
      until: reportingDayStart(addDays(monday, 7)),
      partial: false,
    });
  }
  if (weekday > 0 && thisMonday >= FIRST_TRACKED_MONDAY) {
    weeks.push({
      label: shortDate(thisMonday),
      since: reportingDayStart(thisMonday),
      until: reportingDayStart(today),
      partial: true,
    });
  }
  return weeks;
}

export type QuestionEnds = Map<string, { sessions: number; quits: number }>;

/** One window of `get_survey_friction`, by question id. Throws rather than guess. */
export async function fetchQuestionEnds(since: Date, until: Date): Promise<QuestionEnds> {
  const res = await supabaseFetch("/rest/v1/rpc/get_survey_friction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ since_ts: since.toISOString(), until_ts: until.toISOString() }),
  });
  if (!res.ok) throw new Error(`get_survey_friction ${res.status}`);
  const json = (await res.json()) as {
    by_question?: Array<{ q_id: string; sessions: number; quits: number }>;
  };
  if (!Array.isArray(json?.by_question)) throw new Error("get_survey_friction: no by_question");
  return new Map(json.by_question.map((q) => [q.q_id, { sessions: q.sessions, quits: q.quits }]));
}

export interface DropoffWeeklyPayload {
  kind: "dropout-weekly";
  weeks: string[];
  /** Whether the last column is the week in progress. */
  partialLast: boolean;
  /** n = the question's number in today's (control) order; r = % per week, null under the floor. */
  rows: Array<{ n: number; q: string; r: Array<number | null> }>;
  floor: number;
  updated: string;
}

/**
 * One row per question in the order people are asked them today (the control
 * arm of the question-order test), numbered the way the survey counts them.
 */
export function buildDropoffWeeklyPayload(
  weeks: DropoffWeek[],
  ends: QuestionEnds[],
  updated: string
): DropoffWeeklyPayload {
  const names = surveyQuestionNames(46);
  const asked = orderAskedQuestions(surveyQuestions, "control").filter(
    (q) => q.qId && !HIDDEN_QIDS.has(q.qId)
  );
  return {
    kind: "dropout-weekly",
    weeks: weeks.map((w) => w.label),
    partialLast: weeks.at(-1)?.partial ?? false,
    rows: asked.map((q, i) => ({
      n: i + 1,
      q: names.get(q.qId) ?? q.qId,
      r: ends.map((week) => {
        const e = week.get(q.qId);
        return e && e.sessions >= DROPOFF_FLOOR
          ? Math.round((e.quits / e.sessions) * 1000) / 10
          : null;
      }),
    })),
    floor: DROPOFF_FLOOR,
    updated,
  };
}
