/**
 * The survey's questions for AP-Analytics: who reached each one and who left there (the
 * people the Notion drop-off page counts, through the same get_survey_dropoff_runs), plus
 * time, going back and passing without an answer (ap_survey_steps).
 */
import { askedQuestions } from "@features/admin/server/dropoff-weekly";
import {
  EMAIL_QID,
  fetchDropoffRuns,
  segmentsOf,
  tallyRuns,
  type DropoffRun,
  type Segment,
} from "@features/admin/server/dropoff-report";
import { surveyQuestionNames } from "@features/admin/server/friction-metrics";
import { supabaseFetch } from "@features/admin/server/supabase";
import {
  assignQuestionOrderArm,
  type QuestionOrderArm,
} from "@shared/experiments/questionOrderArm";
import logger from "@shared/observability/logger";
import { reportingDay } from "@shared/time/reporting-day";
import { surveyQuestions } from "@/data/survey-data";

import { grainOf, rangeLabel, trendBuckets, windowOf, type ApFilters, type Grain } from "./filters";
import { draftsKeptFrom, EVENTS_COMPLETE_FROM, ratio, STEP_DEVICE_FROM } from "./metrics";

export interface QuestionRow {
  id: string;
  /** Its number in today's order; 0 for a question no longer asked. */
  n: number;
  text: string;
  chapter: string;
  type: string;
  /**
   * The runs that got at least this far in their order: every question before the furthest a
   * run reached along it (furthestAlong) counts it, so no question has more than the one before.
   */
  reached: number;
  /**
   * The runs it was put to: those recorded on it and those it was in between for (a step lost
   * while the tab was in the background), not those begun before it was added. What its
   * drop-out rate is a share of.
   */
  shown: number;
  /** Shown it, all traffic: what skipped (all traffic, both orders) is a share of. */
  shownAll: number;
  exits: number;
  /** Exits over the runs it was shown to. */
  dropRate: number | null;
  medianMs: number | null;
  wentBack: number;
  skipped: number;
  /** Exits per point of the trend line (all traffic, this order), by the day of the last step. */
  exitsTrend: number[];
  /**
   * First asked during the range (ap_survey_steps' first_asked): the runs begun before passed it
   * unasked, so it was shown only to those begun after.
   */
  newInRange: boolean;
}

/**
 * The opening-order test (C13): from 6 Oct 2026 (20:46 Berlin) half of the new runs are asked
 * five later questions first and four of the first ones much later. Counted in one order, those
 * runs reach question 6 without question 5, and the funnel rises (21 Oct 2026 call). So each
 * order has its own funnel: `rows` the survey's order, `test` the test's.
 */
export const ORDER_TEST_FROM = "2026-10-06";

export interface SurveyQuestions {
  /** In the survey's own order: every run before the test, and its control arm after. */
  rows: QuestionRow[];
  /** People who reached at least one question, in the survey's order. */
  people: number;
  /** The test's arm, in its own order, when the range has runs in it. */
  test: { rows: QuestionRow[]; people: number } | null;
  segment: Segment;
  /** Why the filters could not be applied to the questions, if they could not. */
  blocked: string | null;
  /** What to know before reading the funnel over this range. */
  notes: string[];
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
  /** Runs begun once the order test was live: their first questions, in the order reached. */
  orders?: Array<{ s: string; q: string[] }>;
  /** Runs with steps in the range that began before it (a resumed draft): an earlier start. */
  earlier?: string[];
  /** When each question was first asked, by anyone (its first step or answer), by id. */
  first_asked?: Record<string, string>;
  /**
   * Every question's text as survey_question keeps it, retired ones too: a range reaching back
   * to when one was asked lists it by name, never by a bare id.
   */
  texts?: Record<string, string>;
}

/**
 * How many of `order`'s questions up to the furthest of `qs` were passed over, or null when `qs`
 * were not reached in that order. A step lost while a tab was in the background is one; a run of
 * the other order skips a dozen or more.
 */
function skipped(qs: string[], order: string[]): number | null {
  let last = -1;
  for (const q of qs) {
    const i = order.indexOf(q);
    if (i <= last) return null;
    last = i;
  }
  return last + 1 - qs.length;
}

/**
 * The order a run was asked in. A run begun before the test has no entry: the survey's order.
 * Otherwise the order its first questions follow with the fewest passed over; when both fit as
 * well (it left within the shared opening), the arm a fresh run is dealt by its session
 * (assignQuestionOrderArm).
 */
export function runOrder(
  sessionId: string,
  firstQuestions: Map<string, string[]>,
  orders: Record<QuestionOrderArm, string[]>
): QuestionOrderArm {
  const qs = firstQuestions.get(sessionId);
  if (!qs) return "control";
  const control = skipped(qs, orders.control);
  const variant = skipped(qs, orders.variant);
  if (variant === null && control !== null) return "control";
  if (control === null && variant !== null) return "variant";
  if (control !== null && variant !== null && control !== variant)
    return control < variant ? "control" : "variant";
  return assignQuestionOrderArm(sessionId);
}

/**
 * The questions' segment for the filter bar's state over a range from `from` (read on `today`),
 * or why there is none. A run's device is recorded from STEP_DEVICE_FROM, and an unfinished
 * run keeps its source only while its draft does (30 days): over a range reaching back past
 * either, the segment would hold only the runs that kept it, so it isn't read.
 */
export function questionSegment(
  f: Pick<ApFilters, "source" | "device" | "tier" | "assessment" | "visitor">,
  from: string,
  today: string
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
  if (f.source === "google_ads") {
    return from < draftsKeptFrom(today)
      ? {
          segment: "All traffic",
          blocked:
            "An unfinished run keeps its source only while its draft does (30 days): pick a range within the last 30 days to split it by source.",
        }
      : { segment: "Google Ads", blocked: null };
  }
  if (f.source !== "all") {
    return {
      segment: "All traffic",
      blocked: "Survey steps tell Google Ads apart from everything else, not finer sources.",
    };
  }
  if (f.device === "tablet") {
    return {
      segment: "All traffic",
      blocked: "Survey steps tell phones from computers here, not tablets.",
    };
  }
  if ((f.device === "phone" || f.device === "computer") && from < STEP_DEVICE_FROM) {
    return {
      segment: "All traffic",
      blocked: `Survey steps record the device from ${rangeLabel(STEP_DEVICE_FROM, STEP_DEVICE_FROM)}: pick a range from that day on.`,
    };
  }
  if (f.device === "phone") return { segment: "Phone", blocked: null };
  if (f.device === "computer") return { segment: "Computer", blocked: null };
  return { segment: "All traffic", blocked: null };
}

/** Why "Free survey" doesn't narrow the question funnel. */
export const FREE_FUNNEL_NOTE =
  "All funnels: we only know a survey was paid for in advance once it is finished, so the Funnel filter can't narrow the question funnel.";

/** A run whose last step is this recent is still on that question, not gone from it. */
export const IN_PROGRESS_MS = 30 * 60_000;

/** Runs begun before this (Berlin) were asked the email question first: it moved near the end on 16 Aug 2026. */
export const EMAIL_FIRST_UNTIL = Date.parse("2026-08-17T00:00:00+02:00");

/**
 * How far a run got along an order (`at`: each question's place in it): the furthest place of
 * the questions it was asked, and the first, where it began (a run recorded from part-way, as
 * steps were before cookies were accepted until 18 Sep 2026, still passed the questions before).
 * The email question asked first, by a run begun before EMAIL_FIRST_UNTIL, is left out: placed
 * on today's order, a run that left at question 2 would "reach" question 61. A later run whose
 * first step is the email question was recorded from part-way, as any other. Null when nothing
 * is left.
 */
export function furthestAlong(
  reached: readonly string[],
  at: ReadonlyMap<string, number>,
  startedAt: number
): { low: number; high: number } | null {
  let low = Infinity;
  let high = -1;
  for (const q of reached) {
    const i = at.get(q);
    if (i === undefined || (q === EMAIL_QID && high < 0 && startedAt < EMAIL_FIRST_UNTIL)) continue;
    low = Math.min(low, i);
    high = Math.max(high, i);
  }
  return high < 0 ? null : { low, high };
}

async function fetchSteps(from: string, to: string): Promise<Steps> {
  const [res, questions] = await Promise.all([
    supabaseFetch("/rest/v1/rpc/ap_survey_steps", {
      method: "POST",
      body: JSON.stringify({ p_from: from, p_to: to }),
      timeoutMs: 30_000,
    }),
    // A name is a nicety: a failed read leaves retired questions by their id, not the page.
    supabaseFetch("/rest/v1/survey_question?select=frontend_qid,question&frontend_qid=not.is.null")
      .then((r) => {
        if (!r.ok) throw new Error(`survey_question ${r.status}`);
        return r.json() as Promise<Array<{ frontend_qid: string; question: string }>>;
      })
      .catch((err: unknown) => {
        logger.warn({ err }, "AP: the survey's question texts could not be read");
        return [];
      }),
  ]);
  if (!res.ok) throw new Error(`ap_survey_steps failed (${res.status})`);
  const raw = (await res.json()) as Partial<Steps> | null;
  if (!raw || !Array.isArray(raw.steps) || !Array.isArray(raw.exits))
    throw new Error("ap_survey_steps: unexpected shape");
  return {
    ...(raw as Steps),
    texts: Object.fromEntries(questions.map((q) => [q.frontend_qid, q.question])),
  };
}

export function buildSurveyQuestions(
  runs: Awaited<ReturnType<typeof fetchDropoffRuns>>,
  steps: Steps,
  from: string,
  to: string,
  segment: Segment,
  blocked: string | null,
  now = Date.now()
): SurveyQuestions {
  // Our own test runs are out, as everywhere on these pages, and so are runs begun before the
  // range (a draft resumed in it, a survey that ran past midnight into it): an earlier
  // period's starts, as ap_facts dates a start. Each question then counts the range's runs.
  const out = new Set([...(steps.staff ?? []), ...(steps.earlier ?? [])]);
  const kept = runs.filter(
    (r) => !out.has(r.sessionId) && reportingDay(new Date(r.startedAt)) >= from
  );
  const names = surveyQuestionNames(400);
  const meta = new Map(surveyQuestions.map((q) => [q.qId, q]));
  const stepOf = new Map(steps.steps.map((s) => [s.q_id, s]));
  const points = trendBuckets(from, to);
  // When each question was first asked: one first asked after the range wasn't asked in it,
  // one first asked during it was asked only of the runs begun since.
  const firstAsked = new Map(
    Object.entries(steps.first_asked ?? {}).map(([q, at]) => [q, Date.parse(at)] as const)
  );
  const askedBy = (q: string, at: number) => !(firstAsked.get(q)! > at);
  const firstDay = (q: string) =>
    firstAsked.has(q) ? reportingDay(new Date(firstAsked.get(q)!)) : null;
  const asked = {
    control: askedQuestions(400, "control"),
    variant: askedQuestions(400, "variant"),
  };
  const ids = {
    control: asked.control.map((q) => q.qId),
    variant: asked.variant.map((q) => q.qId),
  };
  const firstQuestions = new Map((steps.orders ?? []).map((o) => [o.s, o.q]));
  const armOf = new Map(kept.map((r) => [r.sessionId, runOrder(r.sessionId, firstQuestions, ids)]));
  // A run still on a question (a step in the last half hour) hasn't left it.
  const gone = (r: DropoffRun) =>
    !(r.lastAt !== null && r.lastAt !== undefined && now - r.lastAt < IN_PROGRESS_MS);
  let unplaced = 0;

  const funnel = (arm: QuestionOrderArm): { rows: QuestionRow[]; people: number } => {
    // Questions first asked after the range weren't asked in it: not rows.
    const order = asked[arm].filter((q) => !(firstDay(q.qId)! > to));
    const at = new Map(order.map((q, i) => [q.qId, i]));
    const runsOfArm = kept.filter((r) => armOf.get(r.sessionId) === arm);
    // How far each run got along the order (furthestAlong): every question up to there was
    // passed (a step lost while the tab was in the background, an answer given on the landing
    // page's card, a question added after the run began). Each question counts the runs that
    // got at least that far, so none has more than the one before it (Marcus and Eman, 24 Oct
    // 2026). A question no longer asked keeps the runs recorded on it. A run leaves at its last
    // question when that is on its way along the order; one that never got to the order's
    // first questions (asked the email question first, then gone) is in no row.
    const along = new Map(
      runsOfArm.map((r) => [r.sessionId, furthestAlong(r.reached, at, r.startedAt)])
    );
    const known = new Set(asked[arm].map((q) => q.qId));
    const offOrder = (r: DropoffRun) => r.reached.filter((q) => !at.has(q) && !known.has(q));
    const exitOf = (r: DropoffRun): string | null => {
      if (!r.leftAt || !gone(r)) return null;
      const span = along.get(r.sessionId);
      const i = at.get(r.leftAt);
      if (i === undefined) return known.has(r.leftAt) ? null : r.leftAt;
      return span && i >= span.low && i <= span.high ? r.leftAt : null;
    };
    const passed = runsOfArm.map((r) => {
      const span = along.get(r.sessionId);
      const reached = new Set(offOrder(r));
      if (span) for (let i = 0; i <= span.high; i++) reached.add(order[i]!.qId);
      return { ...r, reached: [...reached], leftAt: exitOf(r) };
    });
    // The runs in no row (the email question asked first, and nothing else), in the segment shown.
    unplaced += runsOfArm.filter(
      (r) => !along.get(r.sessionId) && !offOrder(r).length && segmentsOf(r).includes(segment)
    ).length;
    // What each run was put: the questions along its way from where it began to its furthest
    // (a step lost in the background is not a question it skipped), but not one first asked
    // after the run began. The rates of a question (drop-out, skipped) are over these runs.
    const shown = runsOfArm.map((r) => {
      const span = along.get(r.sessionId);
      const reached = new Set(offOrder(r));
      if (span)
        for (let i = span.low; i <= span.high; i++) {
          const q = order[i]!.qId;
          if (askedBy(q, r.startedAt) || r.reached.includes(q)) reached.add(q);
        }
      return { ...r, reached: [...reached], leftAt: exitOf(r) };
    });
    const tallies = tallyRuns(passed);
    const tally = tallies.get(segment) ?? { people: 0, byQuestion: new Map() };
    const shownTallies = tallyRuns(shown);
    const put = shownTallies.get(segment) ?? { people: 0, byQuestion: new Map() };
    const putAll = shownTallies.get("All traffic") ?? { people: 0, byQuestion: new Map() };
    // Exits per day: the same runs' exits (the segment's), on the day of their last step.
    const exitDays = new Map<string, string[]>();
    for (const r of passed)
      if (r.leftAt && r.lastAt && segmentsOf(r).includes(segment))
        exitDays.set(r.leftAt, [
          ...(exitDays.get(r.leftAt) ?? []),
          reportingDay(new Date(r.lastAt)),
        ]);
    const exitsTrend = (qId: string) =>
      points.map((b) => (exitDays.get(qId) ?? []).filter((d) => d >= b.from && d <= b.to).length);
    const extra = [...tally.byQuestion.keys()].filter((id) => !known.has(id)).sort();
    const rows: QuestionRow[] = [
      ...order.map((q) => ({ id: q.qId, n: q.n })),
      ...extra.map((id) => ({ id, n: 0 })),
    ]
      .map(({ id, n }) => {
        const t = tally.byQuestion.get(id) ?? { reached: 0, left: 0 };
        const shownTo = put.byQuestion.get(id)?.reached ?? 0;
        const s = stepOf.get(id);
        const day = firstDay(id);
        return {
          id,
          n,
          text: names.get(id) ?? meta.get(id)?.question ?? steps.texts?.[id] ?? id,
          chapter: meta.get(id)?.chapter ?? "",
          type: meta.get(id)?.answerType ?? "",
          reached: t.reached,
          shown: shownTo,
          shownAll: putAll.byQuestion.get(id)?.reached ?? 0,
          exits: t.left,
          dropRate: ratio(t.left, shownTo),
          medianMs: s && s.timed > 0 && s.median_ms !== null ? Number(s.median_ms) : null,
          wentBack: s ? Number(s.went_back) : 0,
          skipped: s ? Number(s.skipped) : 0,
          exitsTrend: exitsTrend(id),
          newInRange: day !== null && day >= from && day <= to,
        };
      })
      .filter((r) => r.reached > 0 || r.n > 0);
    return { rows, people: tally.people };
  };

  const survey = funnel("control");
  const inTest = kept.some((r) => armOf.get(r.sessionId) === "variant");
  const test = inTest ? funnel("variant") : null;
  const notes: string[] = [];
  if (from < EVENTS_COMPLETE_FROM)
    notes.push(
      `Survey steps are recorded for everyone from ${rangeLabel(EVENTS_COMPLETE_FROM, EVENTS_COMPLETE_FROM)}; before, only for visitors who accepted cookies, so fewer runs reach the last question here than the Submissions tile counts.`
    );
  if (unplaced > 0)
    notes.push(
      `${unplaced.toLocaleString("en-US")} run${unplaced === 1 ? "" : "s"} answered only the email question, then left (it came first until 16 Aug 2026). ${unplaced === 1 ? "It counts" : "They count"} in the runs above the table but ${unplaced === 1 ? "sits" : "sit"} in no row, because that question now comes near the end.`
    );
  return {
    rows: survey.rows,
    people: survey.people,
    test,
    segment,
    blocked,
    notes,
    trendLabels: points.map((b) => b.label),
    trendGrain: grainOf(from, to),
  };
}

const cache = new Map<string, { at: number; value: Promise<SurveyQuestions> }>();

/** The questions for a range and the filters' segment (cached for five minutes). */
export function fetchSurveyQuestions(
  from: string,
  to: string,
  f: Pick<ApFilters, "source" | "device" | "tier" | "assessment" | "visitor" | "funnel"> = {
    source: "all",
    device: "all",
    tier: "all",
    assessment: "all",
    visitor: "all",
  },
  now = Date.now()
): Promise<SurveyQuestions> {
  const { segment, blocked } = questionSegment(f, from, reportingDay(new Date(now)));
  const free = f.funnel === "free";
  const key = `${from}|${to}|${segment}|${blocked ?? ""}|${free}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < 5 * 60_000) return hit.value;
  const { since, until } = windowOf({ from, to });
  const value = Promise.all([fetchDropoffRuns(since, until), fetchSteps(from, to)]).then(
    ([runs, steps]) => {
      const q = buildSurveyQuestions(runs, steps, from, to, segment, blocked, now);
      // A run is known to be pay to start's only once its survey is finished and claimed.
      return free ? { ...q, notes: [FREE_FUNNEL_NOTE, ...q.notes] } : q;
    }
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
