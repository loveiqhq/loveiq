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
import {
  formatSignalSummary,
  MIN_CELL_COUNT,
  twoProportionSignal,
} from "@features/admin/server/statistics";
import {
  armLabel,
  AXIS_TITLES,
  isKnownArm,
  type ExperimentAxis,
} from "@features/attribution/server/labels";
import type { AxisFunnelRow } from "@features/attribution/server/axis-trends";
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
/**
 * Per-day, per-arm completions/checkouts/paid for EVERY live axis.
 *
 * Returns [] rather than null on any failure, for the same reason every other
 * fetcher here degrades quietly: one broken source must not lose the whole
 * digest. An empty array simply means no axis clears its chart gate, and the
 * digest says so in one line instead of dying.
 */
export async function fetchAxisFunnelDaily(
  sinceIso: string,
  untilIso: string
): Promise<AxisFunnelRow[]> {
  let raw: unknown = null;
  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_axis_funnel_daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since_ts: sinceIso, until_ts: untilIso }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "conversion-digest: axis funnel RPC non-2xx");
      return [];
    }
    raw = await res.json();
  } catch (err) {
    logger.warn({ err }, "conversion-digest: axis funnel RPC threw");
    return [];
  }
  const out: AxisFunnelRow[] = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const axis = str(r.axis);
    const arm = str(r.arm);
    const day = str(r.day);
    if (!axis || !arm || !day) continue;
    out.push({
      axis,
      arm,
      day,
      completions: int(r.completions),
      checkouts: int(r.checkouts),
      paid: int(r.paid),
    });
  }
  return out;
}

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

export interface StartDayRow {
  day: string;
  arm: string;
  visits: number;
  starts: number;
}

export interface StartTotalRow {
  arm: string;
  visits: number;
  starts: number;
}

export interface LandingStartFunnel {
  daily: StartDayRow[];
  totals: StartTotalRow[];
}

/**
 * Landing -> survey-start, per day and per arm. The metric a landing page actually
 * controls, unlike finished-survey -> paid.
 *
 * Returns null on any failure INCLUDING the function not existing yet, so the
 * digest simply omits this chart until the migration is applied rather than
 * failing the whole send.
 */
export async function fetchLandingStartFunnel(
  sinceIso: string,
  untilIso: string
): Promise<LandingStartFunnel | null> {
  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_landing_start_funnel_daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since_ts: sinceIso, until_ts: untilIso }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "conversion-digest: landing-start RPC non-2xx");
      return null;
    }
    const raw = (await res.json()) as { daily?: unknown; totals?: unknown } | null;
    if (!raw) return null;

    const daily: StartDayRow[] = [];
    for (const row of Array.isArray(raw.daily) ? raw.daily : []) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const day = str(r.day);
      const arm = str(r.arm);
      if (!day || !arm) continue;
      daily.push({ day, arm, visits: int(r.visits), starts: int(r.starts) });
    }

    const totals: StartTotalRow[] = [];
    for (const row of Array.isArray(raw.totals) ? raw.totals : []) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const arm = str(r.arm);
      if (!arm) continue;
      totals.push({ arm, visits: int(r.visits), starts: int(r.starts) });
    }

    return { daily, totals };
  } catch (err) {
    logger.warn({ err }, "conversion-digest: landing-start RPC threw");
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
    // `isKnownArm` is a whitelist. The retired check alone was not: armLabel()
    // returns "Not recorded" with no retired flag for anything unmapped, so a new
    // pricing bucket id would have produced "Report pricing: Not recorded is
    // genuinely ahead — 6.1% vs 3.2%", and two unmapped values would have
    // compared two identically-named things against each other.
    .filter((a) => a.n > 0 && isKnownArm(axis, a.arm) && !armLabel(axis, a.arm).retired)
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
      sentence: `${axisTitle}: only ${only.label} is running (${only.n} finished surveys, ${only.rate}% of them paid) — nothing to compare it against.`,
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
  //
  // There are THREE separate reasons not to decide, and each one names its own
  // cause. They used to collapse into a single "not enough data" sentence, which
  // for the real pricing split reported "328 finished surveys so far" and no
  // shortfall at all — true, and useless, because the actual blocker was ten
  // purchases between the two arms.
  const combinedShort = Math.max(0, 50 - (leader.n + runnerUp.n));

  // 1. Too few finished surveys in total.
  if (combinedShort > 0) {
    // Two gates have to clear, and the SMALL arm is usually the binding one.
    // Reporting only the combined-50 shortfall understated the remaining runway
    // badly: leader 40 / runner-up 5 reads "about 5 more needed" when the small
    // arm actually needs 25.
    const smallArmShort = Math.max(0, TINY_ARM - smallest.n);
    const needed = Math.max(combinedShort, smallArmShort);
    const where = smallArmShort >= combinedShort ? ` in ${smallest.label}` : "";
    return {
      axis,
      axisTitle,
      state: "insufficient-data",
      sentence: `${axisTitle}: not enough data yet — ${leader.n + runnerUp.n} finished surveys so far${needed > 0 ? `, about ${needed} more needed${where}` : ""}.`,
      arms,
    };
  }

  if (smallest.n < TINY_ARM) {
    return {
      axis,
      axisTitle,
      state: "too-early",
      sentence: `${axisTitle}: too early to compare — ${smallest.label} has only ${smallest.n} finished ${smallest.n === 1 ? "survey" : "surveys"} so far (needs ${TINY_ARM}). Far more people SAW it; this counts the ones who finished.`,
      arms,
    };
  }

  // 3. Plenty of finished surveys in both arms, but too few CONVERSIONS for the
  //    z-test to be valid. Saying "no clear winner" here would claim we measured
  //    and found the arms equal, when the truth is the measurement cannot run.
  if (signal.significance === "insufficient-data") {
    const totalConversions = leader.conversions + runnerUp.conversions;
    return {
      axis,
      axisTitle,
      state: "insufficient-data",
      sentence: `${axisTitle}: not enough purchases yet to compare — only ${totalConversions} across ${leader.n + runnerUp.n} finished surveys. Each side needs at least ${MIN_CELL_COUNT} before a comparison means anything.`,
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

  // No `significant-regression` branch: `arms` is sorted by rate descending and
  // the runner-up goes into the control slot, so twoProportionSignal's delta is
  // always >= 0 and that significance value can never be returned here. A branch
  // for it was dead code, and the "warnings first" ordering in buildAlerts was
  // sorting on a severity nothing could produce. A real regression arrives as the
  // other arm being genuinely ahead, which is the same fact.

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
  // Labels say what each number IS. Everything below the first row is cohort:
  // "of the people who finished in this window, how many ever got this far",
  // which is NOT the same as "this many happened during the window" — a purchase
  // two weeks later still counts, and an in-window sale by someone who finished
  // earlier does not. Calling the last row a bare "Paid" under a "30 days"
  // heading invited exactly the wrong reading.
  const raw: Array<{ step: string; count: number }> = [
    { step: "Visits to the site", count: visitors },
    { step: "Finished the survey", count: sum((r) => r.completions) },
    { step: "…of those, opened their report", count: sum((r) => r.reportOpens) },
    { step: "…of those, started checkout", count: sum((r) => r.checkout) },
    { step: "…of those, ever paid", count: sum((r) => r.paid) },
  ];

  const top = raw[0]?.count ?? 0;
  const steps: FunnelStep[] = [];
  // Clamp only the stages that CAN legitimately over-count against their
  // predecessor because they are event-day sourced. "ever paid" is not one of
  // them: a promo one-tap or an admin-granted unlock sets purchased_at without a
  // checkout, so paid can exceed checkout truthfully — and clamping quietly
  // rewrote the number of payers downward under a label that said "Paid".
  const CLAMPED_STEPS = 3;
  let ceiling = Number.POSITIVE_INFINITY;
  for (let i = 0; i < raw.length; i += 1) {
    // eslint-disable-next-line security/detect-object-injection -- numeric loop index over a local array.
    const entry = raw[i]!;
    const count = i < CLAMPED_STEPS ? Math.min(entry.count, ceiling) : entry.count;
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
      // `info`, not `warn`: this is a standing measurement caveat that is true
      // every single day, and warnings sort above everything actionable. A
      // permanent warning is how the last digest earned itself a mute.
      severity: "info",
      message: `${ambiguous.n} visits carry a retired landing page label and cannot be attributed to an arm. They ARE counted in the visits totals above — only the per-arm comparison ignores them, and that comparison is built from finished surveys, not from these visit rows. Visits recorded before the tracking fix landed stay unattributable.`,
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
      // Standing caveat, same reasoning as above: true every day the test runs.
      severity: "info",
      message:
        "Landing page arms are not a fair split: returning visitors keep whichever landing page they saw first, so the current design also carries everyone who has been here before. Returning visitors convert BETTER, so treat the current design's number as flattered — an over-estimate, not a floor.",
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
          severity: "warn",
          // Names WHICH comparison, because there are now two. The per-test
          // section counts only post-change surveys; the "Where the tests stand"
          // line is the 30-day one and is the pooled figure. Saying "the pricing
          // comparison above" told the reader to ignore both, including the only
          // one that is actually clean.
          message: `Report prices changed ${cutover.toISOString().slice(0, 10)}. The pricing line under *Where the tests stand* covers the whole 30 days, so it POOLS both price levels — ignore that one until the window is made up of post-change sales. The per-test numbers further down count only surveys since the change.`,
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
