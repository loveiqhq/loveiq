/**
 * Data + verdicts for the daily conversion digest.
 *
 * Kept separate from the cron route so the numbers and the wording can be
 * unit-tested without an HTTP handler, and so a future /admin surface can render
 * the same verdicts (the mistake `digest-metrics.ts` was written to avoid: two
 * surfaces computing the same metric differently).
 *
 * DESIGN CONSTRAINT THAT SHAPES EVERYTHING HERE. An earlier daily digest was
 * switched off "per the strategy lead" for being FYI-only (commit 25a9ca64).
 * A wall of charts gets muted again, so this module's job is to produce a
 * DECISION — is there a winner, can we call it yet, what changed — and to refuse
 * to imply one when the data cannot support it.
 *
 * The refusals are the point:
 *   - `control` in the visitor series is AMBIGUOUS, not an arm. Until the
 *     recordVisit.ts fix shipped, `white_prev` was written under that retired
 *     label, so the column conflates June's dark traffic with today's
 *     `white_prev`. It is reported as excluded, never as a comparison arm.
 *   - Every comparison runs the TINY_ARM guard as well as the z-test, because a
 *     lopsided split (308 vs 12 today) satisfies the combined n>=50 rule on the
 *     strength of the big arm alone.
 *   - Arm names always go through `armLabel`, so nobody in Slack meets
 *     `white_prev`.
 */

import { supabaseFetch } from "@features/admin/server/supabase";
import { computeRate, delta } from "@features/admin/server/digest-metrics";
import { formatSignalSummary, twoProportionSignal } from "@features/admin/server/statistics";
import { armLabel, AXIS_TITLES, type ExperimentAxis } from "@features/attribution/server/labels";
import logger from "@shared/observability/logger";

/**
 * Below this an arm is "too early to compare" whatever the z-test says. Same
 * value and same reason as `app/api/admin/ab-overview/route.ts`: 828-vs-9 clears
 * combined n>=50 and returns "inconclusive", which would print as a real
 * comparison resting on nine people.
 */
export const TINY_ARM = 30;

/**
 * The stored arm value that cannot be attributed. NOT rendered as an arm — see
 * the module header.
 */
export const AMBIGUOUS_VISITOR_ARM = "control";

export interface ArmFunnelRow {
  arm: string;
  completions: number;
  reportOpens: number;
  checkout: number;
  paid: number;
  revenue: number;
}

export interface DailyArmRow {
  day: string;
  arm: string;
  completions: number;
  reportOpens: number;
  checkout: number;
  paid: number;
  charges: number;
  freeUnlocks: number;
  revenue: number;
}

export interface VisitorRow {
  day: string;
  arm: string;
  n: number;
}

export interface LandingArmFunnel {
  visitors: VisitorRow[];
  daily: DailyArmRow[];
  cohort: ArmFunnelRow[];
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function int(v: unknown): number {
  return Math.trunc(num(v));
}

function str(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

/**
 * Read the per-arm funnel. Returns null on any failure — the caller treats a null
 * section as "skip", matching the convention in `digest-metrics.ts`: one slow or
 * broken source must not lose the whole digest.
 */
export async function fetchLandingArmFunnel(
  sinceIso: string,
  untilIso: string
): Promise<LandingArmFunnel | null> {
  interface RawArmFunnel {
    visitors?: unknown;
    daily?: unknown;
    cohort?: unknown;
  }
  let raw: RawArmFunnel | null = null;
  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_landing_arm_funnel_daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since_ts: sinceIso, until_ts: untilIso }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "conversion-digest: arm funnel RPC non-2xx");
      return null;
    }
    raw = (await res.json()) as RawArmFunnel;
  } catch (err) {
    logger.warn({ err }, "conversion-digest: arm funnel RPC threw");
    return null;
  }
  if (!raw) return null;

  const visitors: VisitorRow[] = [];
  for (const row of Array.isArray(raw.visitors) ? raw.visitors : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const day = str(r.day);
    const arm = str(r.arm);
    if (!day || !arm) continue;
    visitors.push({ day, arm, n: int(r.n) });
  }

  const daily: DailyArmRow[] = [];
  for (const row of Array.isArray(raw.daily) ? raw.daily : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const day = str(r.day);
    const arm = str(r.arm);
    if (!day || !arm) continue;
    daily.push({
      day,
      arm,
      completions: int(r.completions),
      reportOpens: int(r.report_opens),
      checkout: int(r.checkout),
      paid: int(r.paid),
      charges: int(r.charges),
      freeUnlocks: int(r.free_unlocks),
      revenue: num(r.revenue),
    });
  }

  const cohort: ArmFunnelRow[] = [];
  for (const row of Array.isArray(raw.cohort) ? raw.cohort : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const arm = str(r.arm);
    if (!arm) continue;
    cohort.push({
      arm,
      completions: int(r.completions),
      reportOpens: int(r.report_opens),
      checkout: int(r.checkout),
      paid: int(r.paid),
      revenue: num(r.revenue),
    });
  }

  return { visitors, daily, cohort };
}

export interface AxisCohort {
  axis: string;
  arm: string;
  n: number;
  conversions: number;
}

/**
 * Per-axis arm cohorts for the verdict block. Null on failure (section skipped).
 */
export async function fetchArmCohorts(
  sinceIso: string,
  untilIso: string
): Promise<AxisCohort[] | null> {
  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_arm_cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since_ts: sinceIso, until_ts: untilIso }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "conversion-digest: arm cohorts RPC non-2xx");
      return null;
    }
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) return null;
    const rows: AxisCohort[] = [];
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const axis = str(r.axis);
      const arm = str(r.arm);
      if (!axis || !arm) continue;
      rows.push({ axis, arm, n: int(r.n), conversions: int(r.conversions) });
    }
    return rows;
  } catch (err) {
    logger.warn({ err }, "conversion-digest: arm cohorts RPC threw");
    return null;
  }
}

export type VerdictState =
  | "winner"
  | "regression"
  | "no-winner"
  | "too-early"
  | "insufficient-data"
  | "single-arm";

export interface ArmVerdict {
  axis: ExperimentAxis;
  axisTitle: string;
  state: VerdictState;
  /** One sentence, plain English, safe to put in front of a non-technical reader. */
  sentence: string;
  arms: Array<{ label: string; n: number; conversions: number; rate: number }>;
}

/**
 * Turn two-or-more arms into one plain-English verdict.
 *
 * Deliberately deterministic — no model in the decision path. Significance is a
 * maths question, and a language model asked to summarise these numbers can
 * restate one wrongly, on a surface people use to decide where to spend money.
 *
 * `conversions` is whatever the axis is being judged on (paid, completed, …);
 * `n` is that arm's denominator.
 */
export function buildArmVerdict(
  axis: ExperimentAxis,
  rawArms: Array<{ arm: string; n: number; conversions: number }>
): ArmVerdict {
  // eslint-disable-next-line security/detect-object-injection -- axis is a closed union.
  const axisTitle = AXIS_TITLES[axis];

  // Drop retired arms and anything with no exposure at all. A retired arm still
  // carries historical rows, and including it would compare a live design against
  // one nobody has been served for months.
  const arms = rawArms
    .filter((a) => a.n > 0 && !armLabel(axis, a.arm).retired)
    .map((a) => ({
      label: armLabel(axis, a.arm).short,
      n: a.n,
      conversions: Math.min(a.conversions, a.n),
      rate: computeRate(a.conversions, a.n),
    }))
    .sort((left, right) => right.rate - left.rate || right.n - left.n);

  if (arms.length === 0) {
    return {
      axis,
      axisTitle,
      state: "insufficient-data",
      sentence: `${axisTitle}: nothing recorded yet.`,
      arms,
    };
  }

  if (arms.length === 1) {
    const only = arms[0]!;
    return {
      axis,
      axisTitle,
      state: "single-arm",
      sentence: `${axisTitle}: only ${only.label} is running (${only.n} people, ${only.rate}%) — nothing to compare it against.`,
      arms,
    };
  }

  const leader = arms[0]!;
  const runnerUp = arms[1]!;
  const smallest = arms.reduce((min, a) => (a.n < min.n ? a : min), arms[0]!);
  // Argument order is (control, controlSuccesses, variant, variantSuccesses), and
  // the sign of `delta` is variant-minus-control — so the runner-up goes in the
  // control slot to keep a positive delta meaning "the leader is ahead".
  const signal = twoProportionSignal(
    runnerUp.n,
    runnerUp.conversions,
    leader.n,
    leader.conversions
  );

  // Order matters: the sample-size objections come FIRST, because a p-value
  // computed on a lopsided split is answering a question nobody asked.
  if (signal.significance === "insufficient-data") {
    const needed = Math.max(0, 50 - (leader.n + runnerUp.n));
    return {
      axis,
      axisTitle,
      state: "insufficient-data",
      sentence: `${axisTitle}: not enough data yet — ${leader.n + runnerUp.n} people so far${needed > 0 ? `, about ${needed} more needed` : ""}.`,
      arms,
    };
  }

  if (smallest.n < TINY_ARM) {
    return {
      axis,
      axisTitle,
      state: "too-early",
      sentence: `${axisTitle}: too early to compare — ${smallest.label} has only ${smallest.n} ${smallest.n === 1 ? "person" : "people"} so far (needs ${TINY_ARM}).`,
      arms,
    };
  }

  if (signal.significance === "inconclusive") {
    return {
      axis,
      axisTitle,
      state: "no-winner",
      sentence: `${axisTitle}: no clear winner yet — ${leader.label} is ahead (${leader.rate}% vs ${runnerUp.rate}%) but the gap could still be chance.`,
      arms,
    };
  }

  // A regression is the same fact stated from the other side; naming the loser is
  // what makes it actionable.
  if (signal.significance === "significant-regression") {
    return {
      axis,
      axisTitle,
      state: "regression",
      sentence: `${axisTitle}: ${runnerUp.label} is genuinely behind — ${runnerUp.rate}% vs ${leader.rate}% (${formatSignalSummary(signal)}).`,
      arms,
    };
  }

  return {
    axis,
    axisTitle,
    state: "winner",
    sentence: `${axisTitle}: ${leader.label} is genuinely ahead — ${leader.rate}% vs ${runnerUp.rate}% (${formatSignalSummary(signal)}).`,
    arms,
  };
}

export interface FunnelStep {
  step: string;
  count: number;
  pctOfTop: number;
  dropFromPrev: number;
}

/**
 * Build the whole-population funnel from the per-arm cohort rows.
 *
 * `visitors` is passed separately because it is the one stage sourced from
 * funnel_event rather than the submission chain — and it counts visitor-DAYS, not
 * people (funnel_event's PK is (visitor_id, day, event_type)), so the label says
 * "Visits".
 *
 * Every count is clamped to its predecessor. Without it the tail can rise —
 * report_session counts opens on the day they happen, so a report opened today
 * from a submission completed last month lands outside its cohort — and a funnel
 * that goes UP reads as a bug in the product rather than in the measurement.
 */
export function buildFunnel(cohort: ArmFunnelRow[], visitors: number): FunnelStep[] {
  const sum = (pick: (row: ArmFunnelRow) => number) => cohort.reduce((t, r) => t + pick(r), 0);
  const raw: Array<{ step: string; count: number }> = [
    { step: "Visits to the site", count: visitors },
    { step: "Finished the survey", count: sum((r) => r.completions) },
    { step: "Opened their report", count: sum((r) => r.reportOpens) },
    { step: "Started checkout", count: sum((r) => r.checkout) },
    { step: "Paid", count: sum((r) => r.paid) },
  ];

  const top = raw[0]?.count ?? 0;
  const steps: FunnelStep[] = [];
  let ceiling = Number.POSITIVE_INFINITY;
  for (let i = 0; i < raw.length; i += 1) {
    // eslint-disable-next-line security/detect-object-injection -- numeric loop index over a local array.
    const entry = raw[i]!;
    const count = Math.min(entry.count, ceiling);
    const prev = i === 0 ? count : steps[i - 1]!.count;
    steps.push({
      step: entry.step,
      count,
      pctOfTop: computeRate(count, top),
      dropFromPrev: i === 0 ? 0 : computeRate(Math.max(0, prev - count), prev),
    });
    ceiling = count;
  }
  return steps;
}

/** The step with the largest proportional loss, for the headline. Null if flat. */
export function biggestLeak(steps: FunnelStep[]): { from: string; to: string; pct: number } | null {
  let worst: { from: string; to: string; pct: number } | null = null;
  for (let i = 1; i < steps.length; i += 1) {
    // eslint-disable-next-line security/detect-object-injection -- numeric loop index over a local array.
    const step = steps[i]!;
    if (step.dropFromPrev <= 0) continue;
    if (!worst || step.dropFromPrev > worst.pct) {
      worst = { from: steps[i - 1]!.step, to: step.step, pct: step.dropFromPrev };
    }
  }
  return worst;
}

export interface DigestAlert {
  severity: "warn" | "info";
  message: string;
}

/**
 * Alerts fire only on a crossed threshold. A daily list of green ticks is exactly
 * the FYI noise that got the last digest muted, so "nothing to report" is a valid
 * and common outcome.
 */
export function buildAlerts(input: {
  verdicts: ArmVerdict[];
  visitorArms: Array<{ arm: string; n: number }>;
  yesterday: { visitors: number; completions: number; paid: number };
  baseline: { visitors: number; completions: number; paid: number };
  pricingCutoverIso?: string | null;
  now: Date;
}): DigestAlert[] {
  const alerts: DigestAlert[] = [];

  for (const verdict of input.verdicts) {
    if (verdict.state === "winner") {
      alerts.push({ severity: "info", message: `${verdict.sentence} Worth acting on.` });
    } else if (verdict.state === "regression") {
      alerts.push({ severity: "warn", message: verdict.sentence });
    }
  }

  // The ambiguous visitor bucket. Reported as a data problem, not charted as an arm.
  const ambiguous = input.visitorArms.find((a) => a.arm === AMBIGUOUS_VISITOR_ARM);
  if (ambiguous && ambiguous.n > 0) {
    alerts.push({
      severity: "warn",
      message: `${ambiguous.n} visits are recorded under a retired label and cannot be attributed to a homepage, so they are left out of the comparison above. Visits recorded before the tracking fix are permanently unattributable; later ones are correct.`,
    });
  }

  // The landing arms are not comparable populations: proxy.ts returns an existing
  // white/white_prev cookie unchanged, so everyone who visited between the end of
  // round 1 and the start of round 2 is pinned to `white` and only genuinely-new
  // visitors get the coin flip. That biases `white` toward warmer, returning
  // traffic. Charting it prettily does not make it decidable.
  const landing = input.verdicts.find((v) => v.axis === "landing");
  if (landing && landing.arms.length > 1) {
    alerts.push({
      severity: "warn",
      message:
        "Homepage arms are not a fair split: returning visitors keep whichever homepage they saw first, so the current design also carries everyone who has been here before. Read its numbers as a floor, not a verdict.",
    });
  }

  // A same-day pricing change resets the pricing comparison — pre- and post-change
  // arm A are different products and must not be pooled into one rate.
  if (input.pricingCutoverIso) {
    const cutover = new Date(input.pricingCutoverIso);
    if (!Number.isNaN(cutover.getTime())) {
      const ageMs = input.now.getTime() - cutover.getTime();
      if (ageMs >= 0 && ageMs < 7 * 86_400_000) {
        alerts.push({
          severity: "info",
          message: `Report prices changed ${cutover.toISOString().slice(0, 10)}, so the pricing comparison restarts from that date — earlier sales were a different price and are not pooled in.`,
        });
      }
    }
  }

  // Traffic collapse: only when the baseline is big enough for a percentage to
  // mean anything, mirroring `delta`'s own low-base annotation.
  if (input.baseline.visitors >= 20) {
    const change = computeRate(
      Math.max(0, input.baseline.visitors - input.yesterday.visitors),
      input.baseline.visitors
    );
    if (change >= 50) {
      alerts.push({
        severity: "warn",
        message: `Visits yesterday were ${change}% below the usual daily average (${input.yesterday.visitors} vs ~${Math.round(input.baseline.visitors)}).`,
      });
    }
  }

  if (alerts.length === 0) {
    alerts.push({ severity: "info", message: "Nothing crossed a threshold today." });
  }
  // Warnings first. Slack truncates from the bottom under fitBlocks, and a reader
  // skims the top — so the thing that needs acting on must not sit under three
  // informational lines.
  return [
    ...alerts.filter((a) => a.severity === "warn"),
    ...alerts.filter((a) => a.severity !== "warn"),
  ];
}

/** Sum a per-day slice, for the "yesterday vs usual" block. */
export function sumDays(
  rows: DailyArmRow[],
  predicate: (day: string) => boolean
): { completions: number; paid: number; charges: number; revenue: number } {
  let completions = 0;
  let paid = 0;
  let charges = 0;
  let revenue = 0;
  for (const row of rows) {
    if (!predicate(row.day)) continue;
    completions += row.completions;
    paid += row.paid;
    charges += row.charges;
    revenue += row.revenue;
  }
  return { completions, paid, charges, revenue };
}

export function sumVisitors(rows: VisitorRow[], predicate: (day: string) => boolean): number {
  let total = 0;
  for (const row of rows) {
    if (predicate(row.day)) total += row.n;
  }
  return total;
}

/** `delta` re-exported so the route formats trends identically to the other digests. */
export { delta };
