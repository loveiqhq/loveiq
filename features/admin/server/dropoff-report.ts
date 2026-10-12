/**
 * The KPI "Survey Drop-off Rate per Question %" as a report on its Notion page: per week,
 * per question and per slice of the traffic, how many people reached the question, how
 * many of them left there, and whether that is worse than usual.
 *
 * Marcus, 2026-10-09: "a visual proposal of the KPI ... how each KPI report looks like in a
 * chart, table, and regarding the filter / adjustment options", one KPI at a time and in
 * depth. 2026-10-05: split by traffic source, and every rate "in % of previous step but
 * also in percent of visits". So each row carries the drop-off of the people who reached
 * the question (the previous step) and the share of everyone in the survey that week it
 * cost; the visits base belongs to the step before the survey and stays on its own KPI.
 *
 * The measure is get_survey_friction's, read per person (get_survey_dropoff_runs), so the
 * same numbers can be cut by traffic source and by the two survey tests. Summed, the "All
 * traffic" slice equals get_survey_friction exactly (migration 20261012003000).
 */
import {
  askedQuestions,
  DROPOFF_FLOOR,
  shortDate,
  type DropoffWeek,
  type QuestionEnds,
} from "@features/admin/server/dropoff-weekly";
import { supabaseFetch } from "@features/admin/server/supabase";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import { HIDDEN_QIDS } from "@features/survey/questionFlags";
import { assignEmailQuestionArm } from "@shared/experiments/emailQuestionArm";
import { assignQuestionOrderArm } from "@shared/experiments/questionOrderArm";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";
import { surveyQuestions } from "@/data/survey-data";

/** One person's run through the survey in a window (get_survey_dropoff_runs). */
export interface DropoffRun {
  sessionId: string;
  /** Their first survey event ever, in ms: a test counts only runs begun after its launch. */
  startedAt: number;
  /** The questions they reached in the window, by id. */
  reached: string[];
  /** Where they left, when their last step ever fell in the window and they never finished. */
  leftAt: string | null;
  source: "google_ads" | "other" | "unknown";
}

/** The slices the page can filter to. Every person is in "All traffic" and one source. */
export const SEGMENTS = [
  "All traffic",
  "Google Ads",
  "Other sources",
  "Unknown source",
  "Opening order: current",
  "Opening order: new",
  "Email question: current",
  "Email question: anonymous",
] as const;
export type Segment = (typeof SEGMENTS)[number];

const SOURCE_SEGMENT: Record<DropoffRun["source"], Segment> = {
  google_ads: "Google Ads",
  other: "Other sources",
  unknown: "Unknown source",
};

/**
 * The survey tests the page splits by (experiment registry #4 and #7). Both arms are a
 * pure function of the session id, which gives an arm to every session ever recorded, so
 * only runs begun after the launch count. When a test ends, set `end`: runs begun after
 * it saw one version and are no longer split.
 */
export const SURVEY_TESTS = [
  {
    name: "Opening order test",
    launch: Date.parse("2026-10-06T18:18:00Z"),
    end: null as number | null,
    segmentOf: (sessionId: string): Segment =>
      assignQuestionOrderArm(sessionId) === "variant"
        ? "Opening order: new"
        : "Opening order: current",
  },
  {
    name: "Email question test",
    launch: Date.parse("2026-10-08T09:12:46Z"),
    end: null as number | null,
    segmentOf: (sessionId: string): Segment =>
      assignEmailQuestionArm(sessionId) === "anonymous"
        ? "Email question: anonymous"
        : "Email question: current",
  },
] as const;

/** The email question's id. */
export const EMAIL_QID = "00000";

/** How many of the first questions the opening order test reorders. */
export const OPENING_LENGTH = 8;

function parseRun(raw: unknown): DropoffRun {
  const r = (raw ?? {}) as Record<string, unknown>;
  const startedAt = typeof r.started_at === "string" ? Date.parse(r.started_at) : NaN;
  const source = r.source;
  if (
    typeof r.session_id !== "string" ||
    !Number.isFinite(startedAt) ||
    !Array.isArray(r.reached) ||
    !r.reached.every((q) => typeof q === "string") ||
    !(r.left_at === null || typeof r.left_at === "string") ||
    !(source === "google_ads" || source === "other" || source === "unknown")
  ) {
    throw new Error("get_survey_dropoff_runs: a row of an unexpected shape");
  }
  return {
    sessionId: r.session_id,
    startedAt,
    reached: r.reached as string[],
    leftAt: (r.left_at as string | null) ?? null,
    source,
  };
}

/** Everyone who reached a survey question in [since, until). Throws rather than guess. */
export async function fetchDropoffRuns(since: Date, until: Date): Promise<DropoffRun[]> {
  const res = await supabaseFetch("/rest/v1/rpc/get_survey_dropoff_runs", {
    method: "POST",
    body: JSON.stringify({ since_ts: since.toISOString(), until_ts: until.toISOString() }),
    timeoutMs: 20_000,
  });
  if (!res.ok) throw new Error(`get_survey_dropoff_runs ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("get_survey_dropoff_runs: not a list");
  return json.map(parseRun);
}

/** The slices one person belongs to. */
export function segmentsOf(run: DropoffRun): Segment[] {
  const out: Segment[] = ["All traffic", SOURCE_SEGMENT[run.source]];
  for (const test of SURVEY_TESTS) {
    if (run.startedAt >= test.launch && (test.end === null || run.startedAt < test.end)) {
      out.push(test.segmentOf(run.sessionId));
    }
  }
  return out;
}

export interface Tally {
  /** People in the survey in the window. */
  people: number;
  byQuestion: Map<string, { reached: number; left: number }>;
}

/** Per slice, per question: who reached it and who left there. */
export function tallyRuns(runs: DropoffRun[]): Map<Segment, Tally> {
  const out = new Map<Segment, Tally>();
  const bump = (t: Tally, qId: string) => {
    let q = t.byQuestion.get(qId);
    if (!q) t.byQuestion.set(qId, (q = { reached: 0, left: 0 }));
    return q;
  };
  for (const run of runs) {
    for (const segment of segmentsOf(run)) {
      let t = out.get(segment);
      if (!t) out.set(segment, (t = { people: 0, byQuestion: new Map() }));
      t.people += 1;
      for (const qId of run.reached) bump(t, qId).reached += 1;
      if (run.leftAt) bump(t, run.leftAt).left += 1;
    }
  }
  return out;
}

/** The "All traffic" slice in the shape the week-by-week picture takes. */
export function allTrafficEnds(tally: Map<Segment, Tally>): QuestionEnds {
  const all =
    tally.get("All traffic")?.byQuestion ?? new Map<string, { reached: number; left: number }>();
  return new Map([...all].map(([qId, v]) => [qId, { sessions: v.reached, quits: v.left }]));
}

export type Flag = "Worse than usual" | "Top 3 of the week" | "Normal";

export interface DropoffRow {
  /** Unique per row: what the daily sync matches on. */
  key: string;
  /** The week's Monday, a Berlin day. */
  week: string;
  /** Days of that week counted: 7, or fewer for the week in progress (through yesterday). */
  days: number;
  /** The question's number in today's order. */
  n: number;
  qId: string;
  /** "61 · What is your email?": numbered, so Notion sorts the questions in survey order. */
  question: string;
  /** "What is your email?" */
  name: string;
  segment: Segment;
  reached: number;
  left: number;
  /** Left / reached, three decimals; null when fewer than DROPOFF_FLOOR reached it. */
  rate: number | null;
  /** Left / everyone in this slice in the survey that week. */
  ofEveryone: number | null;
  /** The same rate over up to four complete weeks before, people pooled. */
  usual: number | null;
  flag: Flag;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Calendar days from `a` to `b`, both `YYYY-MM-DD` (no time zone involved). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/**
 * P(X >= k) for X ~ Poisson(lambda). Summed in logs: exp(-lambda) is 0 in floating point
 * once lambda passes about 745, and the tail would then always read 1.
 */
export function poissonAtLeast(k: number, lambda: number): number {
  if (k <= 0) return 1;
  let logTerm = -lambda;
  let logBelow = logTerm;
  for (let i = 1; i < k; i++) {
    logTerm += Math.log(lambda / i);
    const hi = Math.max(logBelow, logTerm);
    logBelow = hi + Math.log1p(Math.exp(Math.min(logBelow, logTerm) - hi));
  }
  return Math.max(0, 1 - Math.exp(logBelow));
}

/**
 * The alert of the 8 Oct proposal, made safe for small numbers: the drop-off at least
 * doubled against its usual level AND rose by at least 3 points, at least DROPOFF_FLOOR
 * people reached the question and at least 3 left, and that many leaving is under a 1%
 * chance at the usual rate. Without the last two, one extra person at a question reached
 * by 20 already "doubles" it, and a rise from 0% to 2% calls for nothing.
 */
export function isWorseThanUsual(left: number, reached: number, usual: number | null): boolean {
  if (usual === null || reached < DROPOFF_FLOOR || left < 3) return false;
  const rate = left / reached;
  if (rate < 2 * usual || rate - usual < 0.03) return false;
  return poissonAtLeast(left, Math.max(usual * reached, 0.5)) < 0.01;
}

/**
 * Every row the page shows: one per question asked today, per slice, where at least one
 * person in that slice reached it, for the weeks from `showFrom` on. The weeks before it
 * only feed the usual level, so a week's usual does not change as the window moves on
 * (otherwise every Monday would rewrite four weeks of rows). `today` is the Berlin day
 * the numbers run up to (exclusive).
 */
export function buildDropoffRows(
  weeks: DropoffWeek[],
  tallies: Array<Map<Segment, Tally>>,
  today: string,
  showFrom = 0
): DropoffRow[] {
  const questions = askedQuestions(60);
  const rows: DropoffRow[] = [];
  weeks.forEach((week, i) => {
    if (i < showFrom) return;
    const monday = reportingDay(week.since);
    const days = week.partial ? daysBetween(monday, today) : 7;
    const before = tallies.slice(Math.max(0, i - 4), i);
    const tally = tallies.at(i) ?? new Map<Segment, Tally>();
    for (const segment of SEGMENTS) {
      const t = tally.get(segment);
      if (!t) continue;
      const weekRows: DropoffRow[] = [];
      for (const q of questions) {
        const ends = t.byQuestion.get(q.qId);
        if (!ends || ends.reached === 0) continue;
        let priorReached = 0;
        let priorLeft = 0;
        for (const prior of before) {
          const p = prior.get(segment)?.byQuestion.get(q.qId);
          priorReached += p?.reached ?? 0;
          priorLeft += p?.left ?? 0;
        }
        const usual = priorReached >= DROPOFF_FLOOR ? round3(priorLeft / priorReached) : null;
        weekRows.push({
          key: `${monday} · ${segment} · ${q.qId}`,
          week: monday,
          days,
          n: q.n,
          qId: q.qId,
          question: `${String(q.n).padStart(2, "0")} · ${q.name}`,
          name: q.name,
          segment,
          reached: ends.reached,
          left: ends.left,
          rate: ends.reached >= DROPOFF_FLOOR ? round3(ends.left / ends.reached) : null,
          ofEveryone: t.people > 0 ? round3(ends.left / t.people) : null,
          usual,
          flag: isWorseThanUsual(ends.left, ends.reached, usual) ? "Worse than usual" : "Normal",
        });
      }
      // The three highest drop-offs of the week in this slice, as the picture marks them.
      weekRows
        .filter((r) => r.rate !== null && r.rate > 0)
        .sort((a, b) => b.rate! - a.rate! || b.left - a.left || a.n - b.n)
        .slice(0, 3)
        .forEach((r) => {
          if (r.flag === "Normal") r.flag = "Top 3 of the week";
        });
      rows.push(...weekRows);
    }
  });
  return rows;
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    t *
      (0.254829592 +
        t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
      Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Two-sided p-value of a two-proportion z-test. */
export function twoProportionP(k1: number, n1: number, k2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 1;
  const pooled = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  return 2 * (1 - normalCdf(Math.abs(k1 / n1 - k2 / n2) / se));
}

/** People per arm to tell p1 from p2 at 95% confidence and 80% power. */
export function peoplePerArm(p1: number, p2: number): number {
  const za = 1.959964;
  const zb = 0.841621;
  const pbar = (p1 + p2) / 2;
  const top = za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((top * top) / ((p1 - p2) * (p1 - p2)));
}

export interface TestArmReadout {
  label: string;
  people: number;
  left: number;
}

export interface TestReadout {
  name: string;
  /** "8 Oct". */
  since: string;
  /** What "left" means for this test, after the rate: "at the email question". */
  measure: string;
  arms: [TestArmReadout, TestArmReadout];
  /** People per arm needed to tell a third fewer leaving from chance, when it can be sized. */
  needed: number | null;
  /** The Berlin day both arms reach `needed` at the pace since launch. */
  enoughBy: string | null;
  /** Set once both arms reached `needed`. */
  clearDifference: boolean | null;
}

function addDays(day: string, n: number): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function readout(
  name: string,
  launch: number,
  measure: string,
  arms: [TestArmReadout, TestArmReadout],
  today: string
): TestReadout {
  const [control, variant] = arms;
  const base = control.people >= 50 && control.left > 0 ? control.left / control.people : null;
  const needed = base === null ? null : peoplePerArm(base, base * (2 / 3));
  const fewest = Math.min(control.people, variant.people);
  // From the launch minute, not its day: a test launched in the evening has not had a day.
  const daysRun = Math.max(0.5, (reportingDayStart(today).getTime() - launch) / 86_400_000);
  const pace = fewest / daysRun;
  const enoughBy =
    needed !== null && fewest < needed && pace > 0
      ? addDays(today, Math.ceil((needed - fewest) / pace))
      : null;
  const clearDifference =
    needed !== null && fewest >= needed
      ? twoProportionP(control.left, control.people, variant.left, variant.people) < 0.05
      : null;
  return {
    name,
    since: shortDate(reportingDay(new Date(launch))),
    measure,
    arms,
    needed,
    enoughBy,
    clearDifference,
  };
}

/**
 * Both survey tests, people pooled since each launch. `runs` must cover [the earliest
 * launch, today); runs begun before a test's launch are outside that test.
 *
 * Email question: of those who reached it, the share who left there. Opening order: of
 * everyone, the share who left within the first OPENING_LENGTH questions of the order
 * they were shown.
 */
export function readSurveyTests(runs: DropoffRun[], today: string): TestReadout[] {
  const [order, email] = SURVEY_TESTS;
  const openingOf = (arm: "control" | "variant") =>
    new Set(
      orderAskedQuestions(surveyQuestions, arm)
        .filter((q) => q.qId && !HIDDEN_QIDS.has(q.qId))
        .slice(0, OPENING_LENGTH)
        .map((q) => q.qId)
    );
  const opening = { control: openingOf("control"), variant: openingOf("variant") };

  const inTest = (run: DropoffRun, test: (typeof SURVEY_TESTS)[number]) =>
    run.startedAt >= test.launch && (test.end === null || run.startedAt < test.end);

  const orderArms: [TestArmReadout, TestArmReadout] = [
    { label: "the current order", people: 0, left: 0 },
    { label: "the new order", people: 0, left: 0 },
  ];
  const emailArms: [TestArmReadout, TestArmReadout] = [
    { label: "the current question", people: 0, left: 0 },
    { label: "the anonymous one", people: 0, left: 0 },
  ];
  for (const run of runs) {
    if (inTest(run, order)) {
      const variant = assignQuestionOrderArm(run.sessionId) === "variant";
      const arm = orderArms[variant ? 1 : 0];
      arm.people += 1;
      if (run.leftAt && opening[variant ? "variant" : "control"].has(run.leftAt)) arm.left += 1;
    }
    if (inTest(run, email) && run.reached.includes(EMAIL_QID)) {
      const arm = emailArms[assignEmailQuestionArm(run.sessionId) === "anonymous" ? 1 : 0];
      arm.people += 1;
      if (run.leftAt === EMAIL_QID) arm.left += 1;
    }
  }
  return [
    readout(email.name, email.launch, "at the email question", emailArms, today),
    readout(
      order.name,
      order.launch,
      `within the first ${OPENING_LENGTH} questions`,
      orderArms,
      today
    ),
  ];
}

/** Worse-than-usual questions named in the summary; the rest are counted. */
export const MAX_WORSE_LINES = 5;

/** A run of text in the headline, as Notion styles it. */
export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

const pct = (k: number, n: number) => `${n > 0 ? ((100 * k) / n).toFixed(1) : "0.0"}%`;

/** "5 to 11 Oct", "28 Sep to 4 Oct". */
export function weekRange(monday: string): string {
  const [from, to] = [shortDate(monday), shortDate(addDays(monday, 6))];
  const [d1, m1] = from.split(" ");
  return m1 === to.split(" ")[1] ? `${d1} to ${to}` : `${from} to ${to}`;
}

/**
 * The few lines at the top of the KPI page: last full week, where people left most,
 * anything worse than usual, and the two tests. Lines, not paragraphs of prose.
 */
export function buildHeadline(input: {
  rows: DropoffRow[];
  weeks: DropoffWeek[];
  tallies: Array<Map<Segment, Tally>>;
  tests: TestReadout[];
  today: string;
  marker: string;
}): Span[][] {
  const lines: Span[][] = [];
  const lastFull = input.weeks
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => !w.partial)
    .at(-1);
  if (lastFull) {
    const monday = reportingDay(lastFull.w.since);
    const all = input.tallies[lastFull.i]?.get("All traffic");
    const left = [...(all?.byQuestion.values() ?? [])].reduce((s, q) => s + q.left, 0);
    const people = all?.people ?? 0;
    lines.push([
      { text: `Last full week, ${weekRange(monday)}: `, bold: true },
      {
        text: `${people} people were in the survey and ${left} of them left before the end (${pct(left, people)}).`,
      },
    ]);
    const top = input.rows
      .filter((r) => r.week === monday && r.segment === "All traffic" && r.rate !== null)
      .sort((a, b) => b.rate! - a.rate! || b.left - a.left || a.n - b.n)
      .slice(0, 3);
    if (top.length > 0) {
      lines.push([{ text: "Where most people left:", bold: true }]);
      for (const r of top) {
        lines.push([
          { text: `•  Q${r.n} ${r.name}  ` },
          { text: pct(r.left, r.reached), bold: true },
          { text: ` (${r.left} of the ${r.reached} who reached it)` },
        ]);
      }
    }
  }
  const worse = input.rows.filter(
    (r) =>
      r.segment === "All traffic" &&
      r.flag === "Worse than usual" &&
      daysBetween(r.week, input.today) < 14
  );
  if (worse.length > 0) {
    lines.push([{ text: "Worse than usual:", bold: true }]);
    // Notion takes at most 100 pieces of text in one callout; a bad day lists the worst five.
    worse.sort((a, b) => b.rate! - a.rate! || a.n - b.n);
    for (const r of worse.slice(0, MAX_WORSE_LINES)) {
      lines.push([
        { text: `•  Q${r.n} ${r.name}  ` },
        { text: pct(r.left, r.reached), bold: true },
        {
          text: ` against a usual ${((r.usual ?? 0) * 100).toFixed(1)}% (week of ${shortDate(r.week)}${r.days < 7 ? ", so far" : ""})`,
        },
      ]);
    }
    if (worse.length > MAX_WORSE_LINES) {
      lines.push([
        { text: `•  and ${worse.length - MAX_WORSE_LINES} more, orange in the table below` },
      ]);
    }
  }
  for (const t of input.tests) {
    const [a, b] = t.arms;
    const status =
      t.clearDifference === true
        ? "A clear difference, not chance."
        : t.clearDifference === false
          ? "No clear difference."
          : t.needed === null
            ? "Too early to call: too few people yet to size it."
            : `Too early to call: telling a third fewer leaving apart from chance takes about ${t.needed} people per version${t.enoughBy ? `, around ${shortDate(t.enoughBy)} at this pace` : ""}.`;
    lines.push([
      { text: `${t.name}, since ${t.since}: `, bold: true },
      {
        text: `${pct(a.left, a.people)} left ${t.measure} with ${a.label} (${a.left} of ${a.people}), ${pct(b.left, b.people)} with ${b.label} (${b.left} of ${b.people}). ${status}`,
      },
    ]);
  }
  lines.push([
    {
      text: `Refreshed every morning by the ${input.marker}, last on ${shortDate(input.today)}. Counted in Berlin days, up to yesterday.`,
      italic: true,
    },
  ]);
  return lines;
}
