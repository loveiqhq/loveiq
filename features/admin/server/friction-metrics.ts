/**
 * The friction signals Marcus asked the agents to check against, computed.
 *
 * Source, 2026-09-15 in #all-loveiq: "At the core I feel the agents should
 * check against this" — 22 behavioural signals, hesitation through conversion
 * blockers. Most of them turned out to need no new tracking at all.
 *
 * WHERE THE DATA IS, because it is not one place:
 *
 *   survey_behavior_event  per question, per person: time_spent_ms, answered,
 *                          direction (forward/back/complete/abandon). ~7,400
 *                          rows a week. Seven of the signals come from here.
 *   analytics_event        the report and paywall side: scroll depth, paywall
 *                          open/dismiss, price shown, lock taps, rage clicks.
 *   PostHog only           dead clicks — 3,249 a week, the single highest
 *                          volume friction signal we have, and it writes
 *                          NOTHING to Postgres. Any Postgres-only digest is
 *                          blind to it. Left out here rather than silently
 *                          reported as zero.
 *
 * Every rate is computed, never narrated by a model — the same rule
 * conversion-digest keeps, and for the same reason: these numbers decide where
 * money and attention go.
 */
import { supabaseFetch } from "@features/admin/server/supabase";
import { computeRate } from "@features/admin/server/digest-metrics";
import logger from "@shared/observability/logger";
import { surveyQuestions } from "@/data/survey-data";

/**
 * q_id -> a short human question, so a row can say "Q58 — What is your email?"
 * instead of "Q58". Without it the most valuable finding on the board is a
 * number with no subject. Truncated because the scoreboard is a fixed-width
 * table and one long question would push every other column sideways.
 */
export function surveyQuestionNames(maxLen = 30): Map<string, string> {
  const m = new Map<string, string>();
  for (const q of surveyQuestions) {
    if (!q.qId || !q.question) continue;
    m.set(q.qId, q.question.length > maxLen ? `${q.question.slice(0, maxLen - 1)}…` : q.question);
  }
  return m;
}

/** One row of the scoreboard. */
export interface FrictionSignal {
  /** Marcus's own wording, so the list stays recognisable as his. */
  label: string;
  group: "Survey" | "Report" | "Paywall";
  /** The number, already formatted — "19%", "28s", "1.4x". */
  value: string;
  /** Where it happens, when that is knowable. "Q58 — email" beats "19%". */
  where?: string;
  /** How many observations the number rests on. */
  n: number;
  /**
   * Status. `quiet` is the honest default: weekly volume at the later
   * questions is 50-110 people, so most of these will not move meaningfully in
   * a week and must not be dressed up as a trend.
   */
  status: "watch" | "quiet" | "unknown";
}

/** One question's aggregated friction, as `get_survey_friction` returns it. */
export interface FrictionQuestion {
  question_index: number;
  /**
   * The question MOST people saw at this position — the mode, not the minimum.
   * The survey branches, so one index maps to several questions; labelling by
   * MIN(q_id) named index 0 "What is your email?" off 7 rows while 723 rows
   * said "What is your name?". Every label was a plausible-looking lie.
   */
  q_id: string;
  /** How many different questions appeared at this position. >1 means the
   *  label is what most people saw, not what everyone saw. */
  q_id_variants?: number;
  visits: number;
  abandons: number;
  backs: number;
  skipped: number;
  median_ms: number;
  timed: number;
}

export interface FrictionSnapshot {
  questions: FrictionQuestion[];
  total_rows: number;
  total_timed: number;
  median_ms: number;
}

/**
 * Aggregated server-side, deliberately.
 *
 * Reading survey_behavior_event directly over PostgREST silently truncated at
 * its max-rows cap: 26,109 rows existed for the window and 1,000 came back,
 * with no error and no flag. On that 4% slice the worst drop-off question came
 * out as Q11 at 14%; on the full data it is Q58, the email question, at roughly
 * four times that. The cap did not slow the scoreboard down, it changed its
 * answer.
 */
async function fetchFrictionSnapshot(
  sinceIso: string,
  untilIso: string
): Promise<FrictionSnapshot | null> {
  try {
    const res = await supabaseFetch(`/rest/v1/rpc/get_survey_friction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since_ts: sinceIso, until_ts: untilIso }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as FrictionSnapshot;
    return Array.isArray(json?.questions) ? json : null;
  } catch (err) {
    logger.warn({ err }, "friction-metrics: get_survey_friction unavailable");
    return null;
  }
}

/** Human question label. `question_index` is 0-based; readers count from 1. */
function qLabel(index: number, qId: string, names: Map<string, string>): string {
  const name = names.get(qId);
  return name ? `Q${index + 1} — ${name}` : `Q${index + 1}`;
}

/** Seconds, to one decimal under a minute and whole above it. */
function secs(ms: number): string {
  const s = ms / 1000;
  return s >= 60 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
}

/**
 * The survey half of the scoreboard: seven of Marcus's signals off one query.
 *
 * `questionNames` maps q_id to a short human name so a row can say
 * "Q58 — email" instead of "Q58". Without it the worst finding in the whole
 * set reads as a number with no subject.
 */
export function buildSurveySignals(
  snap: FrictionSnapshot,
  questionNames: Map<string, string> = new Map()
): FrictionSignal[] {
  const signals: FrictionSignal[] = [];
  const qs = snap.questions ?? [];
  if (qs.length === 0 || snap.total_rows === 0) return signals;

  /** Only rank questions with enough traffic for a rate to mean anything. */
  const FLOOR = 20;
  const ranked = qs.filter((q) => q.visits >= FLOOR);
  const label = (q: FrictionQuestion) => qLabel(q.question_index, q.q_id, questionNames);

  // --- Drop-off / exit point -------------------------------------------------
  const worstDrop = ranked
    .map((q) => ({ q, pct: computeRate(q.abandons, q.visits) }))
    .sort((a, b) => b.pct - a.pct)[0];
  if (worstDrop) {
    signals.push({
      label: "Drop-off point",
      group: "Survey",
      value: `${Math.round(worstDrop.pct)}%`,
      where: label(worstDrop.q),
      n: worstDrop.q.visits,
      status: worstDrop.pct >= 10 ? "watch" : "quiet",
    });
  }

  // --- Backtracking ----------------------------------------------------------
  const worstBack = ranked
    .map((q) => ({ q, pct: computeRate(q.backs, q.visits) }))
    .sort((a, b) => b.pct - a.pct)[0];
  if (worstBack) {
    signals.push({
      label: "Backtracking",
      group: "Survey",
      value: `${Math.round(worstBack.pct)}%`,
      where: label(worstBack.q),
      n: worstBack.q.visits,
      status: worstBack.pct >= 10 ? "watch" : "quiet",
    });
  }

  // --- Answer hesitation / step completion time ------------------------------
  const typical = snap.median_ms;
  const slowest = ranked
    .filter((q) => q.timed >= FLOOR)
    .sort((a, b) => b.median_ms - a.median_ms)[0];
  if (slowest && typical > 0) {
    const ratio = slowest.median_ms / typical;
    signals.push({
      label: "Answer hesitation",
      group: "Survey",
      value: `${secs(slowest.median_ms)} (${ratio.toFixed(1)}x typical)`,
      where: label(slowest),
      n: slowest.timed,
      status: ratio >= 2 ? "watch" : "quiet",
    });
  }
  if (typical > 0) {
    signals.push({
      label: "Step completion time",
      group: "Survey",
      value: `${secs(typical)} typical`,
      n: snap.total_timed,
      status: "quiet",
    });
  }

  // --- Time to first action --------------------------------------------------
  const first = qs.find((q) => q.question_index === 0);
  if (first && first.timed >= FLOOR) {
    signals.push({
      label: "Time to first action",
      group: "Survey",
      value: secs(first.median_ms),
      where: label(first),
      n: first.timed,
      status: "quiet",
    });
  }

  // --- Skipped / abandoned questions -----------------------------------------
  const skipped = qs.reduce((n, q) => n + q.skipped, 0);
  const skipPct = computeRate(skipped, snap.total_rows);
  signals.push({
    label: "Skipped questions",
    group: "Survey",
    value: `${skipPct.toFixed(1)}%`,
    n: snap.total_rows,
    status: skipPct >= 5 ? "watch" : "quiet",
  });

  // --- Progress sensitivity --------------------------------------------------
  // Do people leave more as the end gets closer? Across thirds, so the answer
  // does not hinge on one question.
  const maxIdx = Math.max(...qs.map((q) => q.question_index));
  if (maxIdx >= 6) {
    const third = Math.ceil((maxIdx + 1) / 3);
    const band = (lo: number, hi: number) => {
      const inBand = qs.filter((q) => q.question_index >= lo && q.question_index < hi);
      const v = inBand.reduce((n, q) => n + q.visits, 0);
      const a = inBand.reduce((n, q) => n + q.abandons, 0);
      return { v, pct: computeRate(a, v) };
    };
    const early = band(0, third);
    const late = band(2 * third, maxIdx + 1);
    if (early.v >= FLOOR && late.v >= FLOOR) {
      const diff = late.pct - early.pct;
      signals.push({
        label: "Progress sensitivity",
        group: "Survey",
        value: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp late vs early`,
        n: early.v + late.v,
        status: diff >= 3 ? "watch" : "quiet",
      });
    }
  }

  // --- Engagement acceleration / deceleration --------------------------------
  // Median of per-question medians: the row-level medians are all this snapshot
  // carries, and averaging them would let one slow outlier dominate.
  const medOf = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s2 = [...xs].sort((a, b) => a - b);
    return s2[Math.floor(s2.length / 2)]!;
  };
  const half = maxIdx / 2;
  const earlyMed = medOf(
    qs.filter((q) => q.question_index <= half && q.timed > 0).map((q) => q.median_ms)
  );
  const lateMed = medOf(
    qs.filter((q) => q.question_index > half && q.timed > 0).map((q) => q.median_ms)
  );
  if (earlyMed > 0 && lateMed > 0) {
    const ratio = lateMed / earlyMed;
    signals.push({
      label: "Engagement pace",
      group: "Survey",
      value: `${ratio.toFixed(2)}x (${ratio < 1 ? "speeding up" : "slowing down"})`,
      n: snap.total_timed,
      status: ratio <= 0.6 || ratio >= 1.6 ? "watch" : "quiet",
    });
  }

  return signals;
}

/** Report and paywall friction, as `get_report_friction` returns it. */
export interface ReportFrictionSnapshot {
  viewers: number;
  tried_locked: number;
  read_to_end: number;
  paywall_opened: number;
  paywall_closed: number;
  checkout: number;
  dwell_median_ms: number;
  dwell_n: number;
  escape_routes: Array<{ source: string; n: number }>;
  top_locked_section: string | null;
  scrolled_before_paywall: number;
  reopened_pricing: number;
  saw_a_price: number;
  total_rows: number;
}

async function fetchReportFriction(
  sinceIso: string,
  untilIso: string
): Promise<ReportFrictionSnapshot | null> {
  try {
    const res = await supabaseFetch(`/rest/v1/rpc/get_report_friction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since_ts: sinceIso, until_ts: untilIso }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as ReportFrictionSnapshot;
    return typeof json?.viewers === "number" ? json : null;
  } catch (err) {
    logger.warn({ err }, "friction-metrics: get_report_friction unavailable");
    return null;
  }
}

/** Seconds from milliseconds, for a reader rather than a machine. */
function dwell(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function buildReportSignals(snap: ReportFrictionSnapshot): FrictionSignal[] {
  const out: FrictionSignal[] = [];
  const viewers = snap.viewers;
  if (!viewers) return out;

  // --- Report curiosity ------------------------------------------------------
  const curious = computeRate(snap.tried_locked, viewers);
  out.push({
    label: "Report curiosity",
    group: "Report",
    value: `${curious.toFixed(0)}% try a locked section`,
    where: snap.top_locked_section ? `most tried: ${snap.top_locked_section}` : undefined,
    n: viewers,
    status: "quiet",
  });

  // --- Scroll behaviour ------------------------------------------------------
  const toEnd = computeRate(snap.read_to_end, viewers);
  out.push({
    label: "Scroll behaviour",
    group: "Report",
    value: `${toEnd.toFixed(0)}% reach the end`,
    n: viewers,
    status: toEnd < 20 ? "watch" : "quiet",
  });

  // --- Value discovery before paywall ---------------------------------------
  // Did they see enough of the report to know what they were being asked to buy?
  if (snap.paywall_opened > 0) {
    const discovered = computeRate(snap.scrolled_before_paywall, snap.paywall_opened);
    out.push({
      label: "Value discovery before paywall",
      group: "Paywall",
      value: `${discovered.toFixed(0)}% got halfway first`,
      n: snap.paywall_opened,
      status: discovered < 50 ? "watch" : "quiet",
    });
  }

  // --- Paywall dwell ---------------------------------------------------------
  // Marcus's own framing: immediate rejection vs genuine consideration.
  if (snap.dwell_n > 0) {
    out.push({
      label: "Paywall dwell time",
      group: "Paywall",
      value: `${dwell(snap.dwell_median_ms)} median`,
      where: snap.dwell_median_ms < 5000 ? "immediate rejection" : "genuine consideration",
      n: snap.dwell_n,
      status: snap.dwell_median_ms < 5000 ? "watch" : "quiet",
    });
  }

  // --- Paywall escape --------------------------------------------------------
  // Deliberately NOT closed/opened. The scroll paywall opens itself without
  // emitting paywall_initiated, so that ratio comes out over 300% and is
  // nonsense. How people leave is answerable; how many is not, yet.
  const top = snap.escape_routes?.[0];
  if (top) {
    const total = snap.escape_routes.reduce((n, r) => n + r.n, 0);
    out.push({
      label: "Paywall escape",
      group: "Paywall",
      value: `${computeRate(top.n, total).toFixed(0)}% via ${top.source.replace(/_/g, " ")}`,
      n: total,
      status: "quiet",
    });
  }

  // --- Price interaction -----------------------------------------------------
  if (snap.saw_a_price > 0) {
    const back = computeRate(snap.reopened_pricing, snap.saw_a_price);
    out.push({
      label: "Price interaction",
      group: "Paywall",
      value: `${back.toFixed(0)}% open the pricing again`,
      n: snap.saw_a_price,
      status: "quiet",
    });
  }

  // --- Conversion blockers ---------------------------------------------------
  // The end of the chain the other signals describe.
  out.push({
    label: "Conversion blockers",
    group: "Paywall",
    value: `${computeRate(snap.checkout, viewers).toFixed(1)}% of readers reach checkout`,
    n: viewers,
    status: "quiet",
  });

  return out;
}

/** Everything the scoreboard can say today, plus what it cannot. */
export interface FrictionReport {
  signals: FrictionSignal[];
  /** How many raw rows the aggregate actually saw. Printed so a truncation
   *  like the PostgREST one can never hide again. */
  rowsRead: number;
  /** Signals we know we are blind to, named rather than omitted. */
  blind: string[];
}

export async function buildFrictionReport(
  sinceIso: string,
  untilIso: string,
  questionNames: Map<string, string> = new Map()
): Promise<FrictionReport | null> {
  const [snap, report] = await Promise.all([
    fetchFrictionSnapshot(sinceIso, untilIso),
    fetchReportFriction(sinceIso, untilIso),
  ]);
  if (!snap) return null;
  return {
    signals: [
      ...buildSurveySignals(snap, questionNames),
      ...(report ? buildReportSignals(report) : []),
    ],
    rowsRead: snap.total_rows + (report?.total_rows ?? 0),
    // Named, never silently dropped: a scoreboard that omits its blind spots
    // reads as complete.
    blind: ["Dead clicks (PostHog only — writes nothing to Postgres)"],
  };
}

/**
 * The scoreboard, as ONE Slack section.
 *
 * Marcus asked for all 22 signals, and this is a 15-row table rather than 15
 * charts — which is deliberate. `funnel-digest` was switched off for being a
 * rail of pictures with no decision attached, and 15 pictures would be the same
 * mistake with a new name. Numbers read fine as rows; they read badly as
 * pictures.
 *
 * Heading, headline and table go in ONE block because Slack inserts a paragraph
 * gap between two, which the funnel table above already learned the hard way.
 * The dot column is first because a non-technical reader scans shape before
 * digits: ● is worth a look, ○ is normal.
 */
export function buildFrictionSection(report: FrictionReport, windowDays: number): string {
  const watch = report.signals.filter((s) => s.status === "watch");
  const worst = watch[0];

  const headline = worst
    ? `  ·  worst: ${worst.where ? `${worst.where} — ` : ""}${worst.value}`
    : "  ·  nothing above its threshold";

  /**
   * A fenced block, not mrkdwn rows. Slack renders normal text in a
   * proportional font, so padded columns do not line up in it — the first
   * version produced "Value discovery before paywall20%", because that label is
   * exactly the pad width and proportional spacing hid the rest. Monospace is
   * the only way 15 rows read as a table.
   *
   * Widths come from the data, not from a guess, so the longest label sets the
   * column and nothing collides.
   */
  const labelW = Math.max(...report.signals.map((s) => s.label.length)) + 2;
  const valueW = Math.max(...report.signals.map((s) => s.value.length)) + 2;

  const rows = report.signals.map((s) => {
    const dot = s.status === "watch" ? "●" : "·";
    const where = s.where ? s.where : "";
    return `${dot} ${s.label.padEnd(labelW)}${s.value.padEnd(valueW)}${where}`.trimEnd();
  });

  return [
    `*Inside the funnel — ${windowDays} days*${headline}`,
    "```",
    rows.join("\n"),
    "```",
    // Blind spots are named. A board that quietly omits what it cannot see
    // reads as complete, and this one cannot see the largest friction signal
    // we collect.
    report.blind.length > 0 ? `_Not measured here: ${report.blind.join("; ")}_` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
