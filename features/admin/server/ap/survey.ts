/**
 * The survey's questions for AP-Analytics: who reached each one and who left there (the
 * people the Notion drop-off page counts, through the same get_survey_dropoff_runs), plus
 * time, going back and passing without an answer (ap_survey_steps).
 */
import { askedQuestions } from "@features/admin/server/dropoff-weekly";
import { fetchDropoffRuns, tallyRuns, type Segment } from "@features/admin/server/dropoff-report";
import { surveyQuestionNames } from "@features/admin/server/friction-metrics";
import { supabaseFetch } from "@features/admin/server/supabase";
import { reportingDay } from "@shared/time/reporting-day";
import { surveyQuestions } from "@/data/survey-data";

import { grainOf, trendBuckets, windowOf, type ApFilters, type Grain } from "./filters";
import { ratio } from "./metrics";

export interface QuestionRow {
  id: string;
  /** Its number in today's order; 0 for a question no longer asked. */
  n: number;
  text: string;
  chapter: string;
  type: string;
  reached: number;
  exits: number;
  /** Exits over the people who reached it. */
  dropRate: number | null;
  medianMs: number | null;
  wentBack: number;
  skipped: number;
  /** Exits per point of the trend line (all traffic). */
  exitsTrend: number[];
  /**
   * First reached after the range's first day (by the earliest run to reach it): added during
   * the range, so its fall from the question before is not people leaving.
   */
  newInRange: boolean;
}

export interface SurveyQuestions {
  rows: QuestionRow[];
  /** People who reached at least one question. */
  people: number;
  segment: Segment;
  /** Why the filters could not be applied to the questions, if they could not. */
  blocked: string | null;
  trendLabels: string[];
  /** What one point of the exits trend is: a day, a week or a month. */
  trendGrain: Grain;
}

interface Steps {
  steps: Array<{
    q_id: string;
    went_back: number;
    skipped: number;
    median_ms: number | null;
    timed: number;
  }>;
  exits: Array<{ q_id: string; day: string; n: number }>;
  /** Our own finished test runs' sessions; absent from older readers. */
  staff?: string[];
}

/** The questions' segment for the filter bar's state, or why there is none. */
export function questionSegment(
  f: Pick<ApFilters, "source" | "device" | "tier" | "assessment" | "visitor">
): {
  segment: Segment;
  blocked: string | null;
} {
  if (f.tier !== "all")
    return { segment: "All traffic", blocked: "Survey steps don't record the country tier." };
  if (f.visitor !== "all") {
    return {
      segment: "All traffic",
      blocked: "Survey steps can't be split into new and returning visitors.",
    };
  }
  if (f.source !== "all" && f.device !== "all") {
    return {
      segment: "All traffic",
      blocked: "Survey steps split by source or by device, not both at once.",
    };
  }
  if (f.source === "google_ads") return { segment: "Google Ads", blocked: null };
  if (f.source !== "all") {
    return {
      segment: "All traffic",
      blocked: "Survey steps tell Google Ads apart from everything else, not finer sources.",
    };
  }
  if (f.device === "phone") return { segment: "Phone", blocked: null };
  if (f.device === "computer") return { segment: "Computer", blocked: null };
  return { segment: "All traffic", blocked: null };
}

async function fetchSteps(from: string, to: string): Promise<Steps> {
  const res = await supabaseFetch("/rest/v1/rpc/ap_survey_steps", {
    method: "POST",
    body: JSON.stringify({ p_from: from, p_to: to }),
    timeoutMs: 30_000,
  });
  if (!res.ok) throw new Error(`ap_survey_steps failed (${res.status})`);
  const raw = (await res.json()) as Partial<Steps> | null;
  if (!raw || !Array.isArray(raw.steps) || !Array.isArray(raw.exits))
    throw new Error("ap_survey_steps: unexpected shape");
  return raw as Steps;
}

export function buildSurveyQuestions(
  runs: Awaited<ReturnType<typeof fetchDropoffRuns>>,
  steps: Steps,
  from: string,
  to: string,
  segment: Segment,
  blocked: string | null
): SurveyQuestions {
  // Our own test runs are out, as everywhere on these pages.
  const staff = new Set(steps.staff ?? []);
  const kept = runs.filter((r) => !staff.has(r.sessionId));
  const tally = tallyRuns(kept).get(segment) ?? { people: 0, byQuestion: new Map() };
  const names = surveyQuestionNames(400);
  const meta = new Map(surveyQuestions.map((q) => [q.qId, q]));
  const stepOf = new Map(steps.steps.map((s) => [s.q_id, s]));
  const points = trendBuckets(from, to);
  const exitsTrend = (qId: string) =>
    points.map((b) =>
      steps.exits
        .filter((e) => e.q_id === qId && e.day >= b.from && e.day <= b.to)
        .reduce((n, e) => n + Number(e.n), 0)
    );
  // A run's start is its first step ever, so this is no later than the question's first day.
  const firstReached = new Map<string, number>();
  for (const run of kept)
    for (const id of run.reached)
      firstReached.set(id, Math.min(firstReached.get(id) ?? Infinity, run.startedAt));
  const order = askedQuestions(400);
  const known = new Set(order.map((q) => q.qId));
  const extra = [...tally.byQuestion.keys()].filter((id) => !known.has(id)).sort();
  const rows: QuestionRow[] = [
    ...order.map((q) => ({ id: q.qId, n: q.n })),
    ...extra.map((id) => ({ id, n: 0 })),
  ]
    .map(({ id, n }) => {
      const t = tally.byQuestion.get(id) ?? { reached: 0, left: 0 };
      const s = stepOf.get(id);
      const first = firstReached.get(id);
      return {
        id,
        n,
        text: names.get(id) ?? meta.get(id)?.question ?? id,
        chapter: meta.get(id)?.chapter ?? "",
        type: meta.get(id)?.answerType ?? "",
        reached: t.reached,
        exits: t.left,
        dropRate: ratio(t.left, t.reached),
        medianMs: s && s.timed > 0 && s.median_ms !== null ? Number(s.median_ms) : null,
        wentBack: s ? Number(s.went_back) : 0,
        skipped: s ? Number(s.skipped) : 0,
        exitsTrend: exitsTrend(id),
        newInRange: first !== undefined && reportingDay(new Date(first)) > from,
      };
    })
    .filter((r) => r.reached > 0 || r.n > 0);
  return {
    rows,
    people: tally.people,
    segment,
    blocked,
    trendLabels: points.map((b) => b.label),
    trendGrain: grainOf(from, to),
  };
}

const cache = new Map<string, { at: number; value: Promise<SurveyQuestions> }>();

/** The questions for a range and the filters' segment (cached for five minutes). */
export function fetchSurveyQuestions(
  from: string,
  to: string,
  f: Pick<ApFilters, "source" | "device" | "tier" | "assessment" | "visitor"> = {
    source: "all",
    device: "all",
    tier: "all",
    assessment: "all",
    visitor: "all",
  },
  now = Date.now()
): Promise<SurveyQuestions> {
  const { segment, blocked } = questionSegment(f);
  const key = `${from}|${to}|${segment}|${blocked ?? ""}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < 5 * 60_000) return hit.value;
  const { since, until } = windowOf({ from, to });
  const value = Promise.all([fetchDropoffRuns(since, until), fetchSteps(from, to)]).then(
    ([runs, steps]) => buildSurveyQuestions(runs, steps, from, to, segment, blocked)
  );
  cache.set(key, { at: now, value });
  value.catch(() => cache.delete(key));
  if (cache.size > 50) cache.delete(cache.keys().next().value!);
  return value;
}

/** The question most people left on, for the Overview's survey card. */
export function topExit(q: SurveyQuestions): { id: string; text: string } | null {
  const top = [...q.rows].sort((a, b) => b.exits - a.exits)[0];
  return top && top.exits > 0 ? { id: top.id, text: top.text } : null;
}
