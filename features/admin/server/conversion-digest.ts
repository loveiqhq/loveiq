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
import { adCovers, type AdCost } from "@features/brain/server/ingest/analytics";
import { reportingDay } from "@shared/time/reporting-day";
import logger from "@shared/observability/logger";
import { escapeSlack } from "@shared/observability/slack";

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

/**
 * Midway Progress — the funnel step agreed on 2026-09-16 that had no reader.
 *
 * `overall` works from today and is what the funnel TABLE row uses. `daily` and
 * `totals` are per landing arm and are floored at the day the arm stamp reached
 * `survey_partial_save`, so they are legitimately EMPTY until that data
 * accumulates — an empty per-arm list here is "not yet", never "nobody".
 *
 * The threshold is passed in rather than defaulted: where "midway" sits is a
 * definition somebody chose, and a default would let it be chosen by accident.
 *
 * Returns null on any failure INCLUDING the function not existing yet, so the
 * digest omits the row until the migration is applied rather than failing the
 * whole send.
 */
export interface MidwayProgress {
  overall: { sessions: number; reached: number };
  daily: Array<{ day: string; arm: string; sessions: number; reached: number }>;
  totals: Array<{ arm: string; sessions: number; reached: number }>;
  midwayIndex: number;
  /** First day drafts carried an arm. Days before it are ABSENT, never zero. */
  firstArmDay: string | null;
}

export async function fetchMidwayProgress(
  sinceIso: string,
  untilIso: string,
  midwayIndex: number
): Promise<MidwayProgress | null> {
  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_midway_progress_daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        since_ts: sinceIso,
        until_ts: untilIso,
        midway_index: midwayIndex,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "conversion-digest: midway RPC non-2xx");
      return null;
    }
    const raw = (await res.json()) as {
      overall?: unknown;
      daily?: unknown;
      totals?: unknown;
      midwayIndex?: unknown;
      firstArmDay?: unknown;
    } | null;
    if (!raw) return null;

    const o = (raw.overall ?? {}) as Record<string, unknown>;
    const daily: MidwayProgress["daily"] = [];
    for (const row of Array.isArray(raw.daily) ? raw.daily : []) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const day = str(r.day);
      const arm = str(r.arm);
      if (!day || !arm) continue;
      daily.push({ day, arm, sessions: int(r.sessions), reached: int(r.reached) });
    }
    const totals: MidwayProgress["totals"] = [];
    for (const row of Array.isArray(raw.totals) ? raw.totals : []) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const arm = str(r.arm);
      if (!arm) continue;
      totals.push({ arm, sessions: int(r.sessions), reached: int(r.reached) });
    }

    return {
      overall: { sessions: int(o.sessions), reached: int(o.reached) },
      daily,
      totals,
      // Echoed back by the RPC. Trusting the REQUEST's number here would let the
      // caption name a threshold the numbers were not computed at.
      midwayIndex: int(raw.midwayIndex) || midwayIndex,
      firstArmDay: str(raw.firstArmDay) || null,
    };
  } catch (err) {
    logger.warn({ err }, "conversion-digest: midway RPC threw");
    return null;
  }
}

export type VerdictState =
  "winner" | "regression" | "no-winner" | "too-early" | "insufficient-data" | "single-arm";

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
  rawArms: Array<{ arm: string; n: number; conversions: number }>,
  /**
   * Include arms marked `retired` in labels.ts — same option, same meaning and
   * same default as `rowsForAxis` in axis-trends.ts.
   *
   * Off in production: a verdict is about what is running. On for a historical
   * read of a concluded comparison, and on in the tests of the wording below,
   * which would otherwise collapse to one arm — every axis is concluded as of
   * 2026-09-19, so with the filter on there is no two-arm fixture left anywhere
   * and every test of "genuinely ahead", the confidence interval, the TINY_ARM
   * refusal and the insufficient-data counts would pass without reaching the
   * code it names.
   */
  opts?: { includeRetired?: boolean }
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
    .filter(
      (a) =>
        a.n > 0 &&
        isKnownArm(axis, a.arm) &&
        (opts?.includeRetired || !armLabel(axis, a.arm).retired)
    )
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
export function buildFunnel(
  cohort: ArmFunnelRow[],
  visitors: number,
  /**
   * Survey starts for the same window, from `get_funnel_cvr_sparklines`. Optional:
   * when that source is unreadable the funnel renders exactly as it did before,
   * rather than showing a row of zero, which would read as "nobody started".
   *
   * Asked for by the strategy lead on 2026-09-15 — the visits -> finished drop was
   * one 96.5% row, so it could not say whether people fail to START or start and
   * give up. Split, it says both: measured that day, 8.3% of visits start and 58.5%
   * of starters never finish.
   *
   * Sourced from the sparkline RPC rather than the landing-arm one on purpose: it
   * reports the SAME 12,308 visits and the SAME 425 finishers as the rows either
   * side of it, so the new row cannot disagree with its own neighbours. The
   * per-arm start funnel would not — it counts only days the landing cookie was
   * recorded, a shorter window on a smaller denominator.
   */
  starts?: number | null,
  /**
   * Midway Progress: how many sessions got at least `midway.index` questions in.
   *
   * Optional, and omitted rather than zeroed when absent — the row only appeared
   * on 2026-09-19 and a funnel that prints "0 reached the halfway point" above
   * 411 finishers says something false about the product rather than about the
   * measurement.
   */
  midway?: { reached: number; index: number } | null,
  /**
   * Paywall Hits — Mark's sixth step, which the table used to skip straight past
   * to "started checkout". Optional and omitted rather than zeroed: the
   * instrument only started on 2026-09-05, and a 0 printed under a 30-day
   * heading says the paywall was never reached.
   */
  paywallHits?: number | null
): FunnelStep[] {
  const sum = (pick: (row: ArmFunnelRow) => number) => cohort.reduce((t, r) => t + pick(r), 0);
  const completions = sum((r) => r.completions);
  /**
   * The row needs starts that are actually COMPLETE for the window, and the test
   * for that is that they exceed the finishers.
   *
   * Start tracking only began 2026-08-16. Over any window reaching back past that,
   * the source reports fewer starts than finished surveys — 1,038 against 1,673
   * across the whole of recorded history — which is not a funnel, it is missing
   * data. Drawing it would have clamped the finisher count DOWN to the number of
   * starts and published a smaller, wrong 425, silently, under a truthful label.
   *
   * The digest's own window is a rolling 30 days and so has sat entirely inside
   * the tracked period since 2026-09-15; this guard is for every other window
   * someone might pass, and for the boundary case where a window's finishers
   * mostly started before it opened.
   */
  const hasStarts =
    typeof starts === "number" && Number.isFinite(starts) && starts > 0 && starts >= completions;
  /**
   * Same shape of guard as `hasStarts`, and for the same reason.
   *
   * Midway comes from `survey_partial_save` while finishers come from the
   * submission cohort — different id spaces, different windows. If midway reads
   * BELOW finishers the sources disagree, and drawing it anyway would clamp the
   * finisher count down to it and publish a smaller, wrong number of completions
   * under a truthful label. That exact failure is what the starts guard was
   * written for. Measured 2026-09-19: 579 reached question 30 against 411
   * finishers, so there is real headroom — this is for the windows where there
   * is not.
   */
  /**
   * Same guard, third time — and this one was MISSING while the comment above it
   * claimed it was here. An audit caught it.
   *
   * The paywall row sits below report opens and the clamp only ever pulls DOWN,
   * so a paywall count larger than opens is silently rewritten to equal opens and
   * the table prints "100%" — "every single person who opened their report hit
   * the paywall". That fabrication is exactly what the 4x row-count bug produced,
   * and fixing the count did not remove the mechanism that laundered it.
   *
   * It is still reachable with a correct count, because the two rows have
   * different denominators: get_paywall_hits counts every submission in the
   * window, while reportOpens comes from the arm-attributed cohort, which covers
   * ~92% of them. So the paywall row can legitimately include people the row
   * above excludes.
   *
   * When that happens the row is OMITTED rather than clamped. A missing step is
   * a gap someone notices; a clamped one is a number someone quotes.
   */
  const paywallCount =
    typeof paywallHits === "number" && Number.isFinite(paywallHits) ? paywallHits : null;
  const reportOpensTotal = sum((r) => r.reportOpens);
  const hasPaywall = paywallCount !== null && paywallCount > 0 && paywallCount <= reportOpensTotal;

  const hasMidway =
    !!midway &&
    Number.isFinite(midway.reached) &&
    midway.reached > 0 &&
    midway.reached >= completions;
  // Labels say what each number IS. Everything below the first row is cohort:
  // "of the people who finished in this window, how many ever got this far",
  // which is NOT the same as "this many happened during the window" — a purchase
  // two weeks later still counts, and an in-window sale by someone who finished
  // earlier does not. Calling the last row a bare "Paid" under a "30 days"
  // heading invited exactly the wrong reading.
  const raw: Array<{ step: string; count: number }> = [
    { step: "Visits to the site", count: visitors },
    // Deliberately NOT relabelled "…of those, finished it". Starts are event-day
    // counts and finishers are a cohort, so one is not strictly a subset of the
    // other across a window boundary; claiming it in the label would be a claim
    // the data does not support.
    ...(hasStarts ? [{ step: "Started the survey", count: starts as number }] : []),
    /**
     * The step Mark named on 2026-09-16 and the framework called "needs
     * building". The label carries the THRESHOLD rather than saying "midway",
     * because "midway" is the definition and the question number is the fact —
     * and an unnamed percentage in this table is precisely what put a 96.5%
     * nobody could source into a meeting.
     */
    ...(hasMidway ? [{ step: `Reached question ${midway!.index}`, count: midway!.reached }] : []),
    { step: "Finished the survey", count: completions },
    { step: "…of those, opened their report", count: sum((r) => r.reportOpens) },
    /**
     * Between the report and checkout, which is where Mark put it. "Hit the
     * paywall" and "started checkout" are different decisions and the drop
     * between them is the one worth acting on.
     */
    ...(hasPaywall ? [{ step: "…of those, hit the paywall", count: paywallCount }] : []),
    { step: "…of those, started checkout", count: sum((r) => r.checkout) },
    /**
     * UNLOCKED, not "ever paid".
     *
     * This counts `report_price_quote.purchased_at`, which fulfillment sets
     * whenever a report unlocks — including a 100%-off coupon. The break-even
     * block below counts SALES (succeeded, non-test, amount > 0) and names the
     * free unlocks separately, per the definition recorded 2026-09-19. Both were
     * labelled "paid", so one message answered "how many paid" with two
     * different numbers — 4 here and 3 there, four lines apart — which is the
     * class of unsourceable figure this whole rewrite exists to remove.
     *
     * The count is not wrong for what it measures, so the LABEL moved rather
     * than the number: the funnel asks "did they get the report", break-even
     * asks "did we get money". Reconciling them into one figure needs a
     * cohort-scoped charge count, which the arm RPC does not return — it has
     * `charges` on the daily rows but not on the cohort totals.
     */
    { step: "…of those, ever unlocked it", count: sum((r) => r.paid) },
  ];

  const top = raw[0]?.count ?? 0;
  const steps: FunnelStep[] = [];
  // Clamp only the stages that CAN legitimately over-count against their
  // predecessor because they are event-day sourced. "ever unlocked it" is not one of
  // them: a promo one-tap or an admin-granted unlock sets purchased_at without a
  // checkout, so paid can exceed checkout truthfully — and clamping quietly
  // rewrote the number of payers downward under a label that said "Paid".
  // Counts steps, so it has to move with the array: without the starts row it is
  // visits/finished/opened, with it, visits/starts/finished/opened. The added
  // ceiling is finished-against-starts, which is tighter than the old
  // finished-against-visits and so can bite where that never did — a window whose
  // finishers mostly started before it opens. Monotonicity is what a funnel means,
  // so it stays clamped; today there is 2.4x of headroom (425 against 1025).
  /**
   * Counts steps, so it moves with the array: visits, [starts], [midway],
   * finished, opened, [paywall]. Hardcoding it was already a latent trap, and it
   * has since had to absorb two new optional rows.
   *
   * PAYWALL IS CLAMPED, but the clamp can no longer bite: `hasPaywall` refuses
   * the row outright when it exceeds report opens, so by the time it is in the
   * array it is already a subset. The clamp stays as the second guard — if the
   * refusal is ever loosened, monotonicity still holds.
   *
   * The history is worth keeping. This comment used to justify clamping with
   * "it reads 500 against 412 report opens". That 500 was a row count over a
   * table holding four rows per person, and the clamp turned it into a tidy,
   * fabricated 100% instead of letting the absurdity show.
   *
   * `ever unlocked it` stays unclamped for the opposite reason: a promo one-tap or an
   * admin-granted unlock sets purchased_at with no checkout, so paid can exceed
   * checkout TRUTHFULLY.
   *
   * ponytail: clamping is the honest-but-lossy answer — it shows the funnel
   * monotonic and hides how much larger the period count is. The real fix is to
   * cohort-scope the paywall count by joining it to the submission set, which
   * needs an RPC; worth doing if the gap ever matters on its own.
   */
  const CLAMPED_STEPS = 3 + (hasStarts ? 1 : 0) + (hasMidway ? 1 : 0) + (hasPaywall ? 1 : 0);
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
  /**
   * Whether yesterday is actually IN the visitor series.
   *
   * `sumVisitors` returns 0 both for a day with no traffic and for a day that
   * was never generated, and those must not read the same. On 2026-09-19 the
   * day series ended a day short (a bare `::date` on a Berlin-midnight bound
   * resolved in the pooler's UTC, so `until_day - 1` landed on the day before
   * yesterday), yesterday's bucket did not exist, the sum was 0, and this file
   * published "Visits yesterday were 100% below the usual daily average
   * (0 vs ~515)" on a day with 543 visits.
   *
   * The bound is fixed, but a missing day must never be reportable as a
   * collapse — that is a claim about traffic made from an absence of data.
   * Defaults to true so an omitted flag cannot silently mute a real alert.
   */
  yesterdayObserved?: boolean;
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

  /**
   * The retired-label visit bucket used to be reported here in three sentences.
   * Removed with the per-arm visit numbers it was explaining: the message no
   * longer quotes visits by arm anywhere, so the caveat had no subject left. It
   * was also `info` severity and true every single day, which is how a digest
   * teaches people to skim past its alerts.
   */

  /**
   * The "landing arms are not a fair split" caveat used to be an alert here.
   * It was `info` severity and true every single day the test ran — which this
   * file already names, twenty lines up, as "how a digest teaches people to
   * skim past its alerts". It was also the ONLY thing in the Alerts section on
   * a normal day, so the section trained people to ignore it before a real
   * alert ever arrived.
   *
   * The fact is real and is not stated anywhere else, so it moved rather than
   * died: it now rides in the *Landing page → survey* line, beside the numbers
   * it qualifies, where a reader meets it at the moment it changes their
   * reading. See LANDING_CAVEAT in the conversion-digest route.
   */

  /**
   * The pricing-cutover warning is gone with the pooled 30-day line it warned
   * about. The pricing entry under *The tests* is scoped to the change date and
   * says so on its own first line ("since 24 Aug"), so an alert telling the
   * reader to ignore a number the message no longer prints was pure noise —
   * and a `warn` at that, sorted above everything actionable.
   */

  // Traffic collapse: only when the baseline is big enough for a percentage to
  // mean anything, mirroring `delta`'s own low-base annotation.
  if (input.baseline.visitors >= 20 && input.yesterdayObserved !== false) {
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

/**
 * Paywall Hits — the sixth step of the funnel Mark named on 2026-09-16.
 *
 * The agreed language is visits, started, midway, completed, report opened,
 * PAYWALL HITS, purchase. The digest printed "started checkout" in that slot,
 * which is a different moment: hitting the wall is not the same as deciding to
 * buy, and the gap between them is the single most actionable number in the
 * bottom half of the funnel. Measured 2026-09-19: 500 hits, 35 checkouts.
 *
 * `report_price_quote.paywall_reached_at` only began being written on
 * 2026-09-05, so `firstRowDay` comes back with it — over a 30-day window the
 * step covers far less than 30 days, and a step-conversion computed across that
 * mismatch would be quietly wrong in the direction that flatters us.
 *
 * THIS WAS A HEAD COUNT AND THAT WAS THE BUG. PostgREST has no COUNT(DISTINCT),
 * so counting rows was the only thing the shortcut could do — and
 * `report_price_quote` holds ONE ROW PER PLAN, four per person. The window read
 * 500, was printed as 500 people, exceeded the 412 report opens above it, and
 * the funnel's monotonic clamp quietly pulled it back to 412 and rendered
 * "100%". A fabricated number, from a number 4x too large, under a truthful
 * label. The RPC counts DISTINCT submissions and scopes to the same cohort as
 * every other "…of those" row: 106 against 412 opens.
 */
export interface PaywallHits {
  hits: number;
  /** First day the instrument wrote anything, or null when it never has. */
  firstRowDay: string | null;
}

export async function fetchPaywallHits(
  sinceIso: string,
  untilIso: string
): Promise<PaywallHits | null> {
  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_paywall_hits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since_ts: sinceIso, until_ts: untilIso }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "conversion-digest: paywall RPC non-2xx");
      return null;
    }
    const raw = (await res.json()) as { hits?: unknown; firstRowDay?: unknown } | null;
    if (!raw) return null;
    return { hits: int(raw.hits), firstRowDay: str(raw.firstRowDay) || null };
  } catch (err) {
    logger.warn({ err }, "conversion-digest: paywall RPC threw");
    return null;
  }
}

/**
 * Per-arm results for the email A/B tests.
 *
 * Marcus asked on 2026-08-24 for "a daily chart with CVR per experiment, Slack
 * pushed, winner confidence". Per EXPERIMENT — and until 2026-09-19 only the
 * landing test could be read at all, so that chart could show one experiment and
 * silently omit five. These come from counters the Resend webhook writes off the
 * tags echoed back with each send.
 *
 * Returns null on any failure INCLUDING the function not existing yet, which
 * omits the section rather than failing the send.
 */
export interface EmailExperimentRow {
  experiment: string;
  arm: string;
  delivered: number;
  clicked: number;
  /** Spam complaints. A variant marked as spam more often is a result. */
  complained: number;
  bounced: number;
}

export async function fetchEmailExperimentResults(
  sinceIso: string,
  untilIso: string
): Promise<EmailExperimentRow[] | null> {
  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_email_experiment_results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since_ts: sinceIso, until_ts: untilIso }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "conversion-digest: email-experiment RPC non-2xx");
      return null;
    }
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) return null;
    const rows: EmailExperimentRow[] = [];
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const experiment = str(r.experiment);
      const arm = str(r.arm);
      if (!experiment || !arm) continue;
      rows.push({
        experiment,
        arm,
        delivered: int(r.delivered),
        clicked: int(r.clicked),
        complained: int(r.complained),
        bounced: int(r.bounced),
      });
    }
    return rows;
  } catch (err) {
    logger.warn({ err }, "conversion-digest: email-experiment RPC threw");
    return null;
  }
}

/**
 * One plain sentence per email experiment: the arms, their click rates, and
 * whether the gap means anything yet.
 *
 * CLICKS over DELIVERED, not opens. Open tracking fires on a pixel load, which
 * Apple Mail Privacy Protection pre-fetches for every message whether or not a
 * human looked — so an open rate measures which mail clients the arms drew, and
 * the two arms draw the same clients. A click is a person deciding.
 *
 * Significance is computed, never narrated: `twoProportionSignal` plus the same
 * minimum-cell rule the landing verdicts use. An arm pair too small to say
 * anything says exactly that.
 */
export function buildEmailExperimentLines(rows: EmailExperimentRow[]): string[] {
  const byExperiment = new Map<string, EmailExperimentRow[]>();
  for (const r of rows) {
    if (!byExperiment.has(r.experiment)) byExperiment.set(r.experiment, []);
    byExperiment.get(r.experiment)!.push(r);
  }

  const lines: string[] = [];
  for (const [experiment, arms] of [...byExperiment.entries()].sort()) {
    const live = arms.filter((a) => a.delivered > 0).sort((a, b) => a.arm.localeCompare(b.arm));

    /**
     * An arm with clicks but no recorded deliveries is a BROKEN MEASUREMENT, not
     * an absent one, and dropping it silently hides that. It means delivered
     * webhooks were missed while clicked ones landed — the denominator is gone
     * and every rate computed beside it is against a different population.
     */
    const clicksWithoutDeliveries = arms.filter((a) => a.delivered === 0 && a.clicked > 0);

    if (live.length === 0) {
      /**
       * Every arm has a zero denominator. The route's fallback only fires when
       * the whole result set is empty, so without this the experiment vanishes
       * with no section, no line and no explanation — precisely the quiet
       * omission this feature was built to remove.
       */
      const clicks = arms.reduce((t, a) => t + a.clicked, 0);
      lines.push(
        clicks > 0
          ? `• *${escapeSlack(experiment)}* — ${clicks} click(s) recorded but no deliveries; the delivered webhook is not arriving, so no rate can be computed`
          : `• *${escapeSlack(experiment)}* — nothing recorded yet`
      );
      continue;
    }

    const rate = (a: EmailExperimentRow) => computeRate(a.clicked, a.delivered);
    const parts = live.map(
      (a) => `${a.arm.toUpperCase()} ${rate(a)}% (${a.clicked}/${a.delivered})`
    );

    if (live.length === 1) {
      // One arm with traffic is not a comparison. Say so rather than printing a
      // lone rate that reads as a result.
      lines.push(
        `• *${escapeSlack(experiment)}* — ${parts[0]}, only one arm has data yet` +
          (clicksWithoutDeliveries.length > 0
            ? ` (${clicksWithoutDeliveries.map((a) => a.arm.toUpperCase()).join(", ")} has clicks but no recorded deliveries)`
            : "")
      );
      continue;
    }

    /**
     * Ranked on the RAW proportion, not on `rate()`.
     *
     * `rate()` is computeRate, which rounds to one decimal — so 12/2000 (0.600%)
     * and 13/2100 (0.619%) both became "0.6", the sort saw a tie, and stable sort
     * fell back to alphabetical order. The line then named A as ahead while
     * printing a NEGATIVE delta for A, because the z-test ran on the raw counts
     * the sort had ignored. Realistic email volumes reach that every day.
     */
    const raw = (a: EmailExperimentRow) => (a.delivered > 0 ? a.clicked / a.delivered : 0);
    const ranked = [...live].sort((a, b) => raw(b) - raw(a));
    const [lead, next] = [ranked[0]!, ranked[1]!];

    /**
     * Clicks are click EVENTS: Resend fires one per link, each with its own
     * svix id, so a single reader can click three times. Delivered is one event
     * per email. The ratio is therefore not a proportion, and twoProportionSignal
     * refuses outright when successes exceed the sample — which would print
     * "not enough clicks yet" on an arm with ABUNDANT clicks, the exact opposite
     * of the truth.
     *
     * Capped at the denominator so the z-test gets a valid proportion, and the
     * cap is disclosed rather than silently applied.
     */
    /**
     * When an arm exceeds its own denominator the ratio is not a proportion at
     * all, and a z-test on it is arithmetic nonsense. twoProportionSignal refuses
     * outright, which printed "not enough clicks yet" on an arm with ABUNDANT
     * clicks; capping to the denominator was worse, manufacturing a 100% rate.
     * The counts are reported and the verdict declined, with the reason.
     */
    const overCounted = live.some((a) => a.clicked > a.delivered);
    if (overCounted) {
      lines.push(
        `• *${escapeSlack(experiment)}* — ${parts.join(" · ")} — not comparable: some readers clicked more than once, so the rate is not a share of recipients`
      );
      continue;
    }
    const signal = twoProportionSignal(next.delivered, next.clicked, lead.delivered, lead.clicked);
    /**
     * Three outcomes, not two. "No clear winner" claims we measured and found
     * the arms equal; "not enough clicks yet" says the measurement cannot run.
     * Collapsing them is how a test with nine clicks gets read as a tie and
     * quietly concluded.
     */
    const verdict =
      signal.significance === "insufficient-data"
        ? `not enough clicks yet to compare — each arm needs at least ${MIN_CELL_COUNT}`
        : /**
           * A dead heat is not a lead, but it is not "level" either until there
           * is enough data to say so — which is why this sits BELOW the
           * insufficient-data branch. With two clicks an arm, identical rates are
           * a coincidence, not a finding. Above it, "inconclusive" used to render
           * "A is ahead but the gap could still be chance" over two literally
           * equal numbers.
           */
          raw(lead) === raw(next)
          ? `level so far — the arms are identical on this measure`
          : signal.significance === "inconclusive"
            ? `no clear winner yet — ${lead.arm.toUpperCase()} is ahead but the gap could still be chance (${formatSignalSummary(signal)})`
            : signal.significance === "significant-lift"
              ? `${lead.arm.toUpperCase()} is genuinely ahead (${formatSignalSummary(signal)})`
              : /**
                 * `significant-regression` is the fourth member of the enum and used
                 * to fall through to "genuinely ahead" — printing the exact opposite
                 * of the finding. It should be unreachable now that ranking is on the
                 * raw proportion, so saying so out loud beats asserting a direction
                 * the numbers contradict.
                 */
                `the arms disagree with their own ranking — not reporting a winner (${formatSignalSummary(signal)})`;
    /**
     * Complaints, when there are any. An arm that wins on clicks while being
     * marked as spam twice as often has not won — and the counters have always
     * been written, they just had no reader.
     */
    const complaints = live.filter((a) => a.complained > 0);
    const spam =
      complaints.length > 0
        ? ` · spam: ${complaints.map((a) => `${a.arm.toUpperCase()} ${a.complained}`).join(", ")}`
        : "";
    lines.push(`• *${escapeSlack(experiment)}* — ${parts.join(" · ")} — ${verdict}${spam}`);
  }
  return lines;
}

/**
 * Unit economics for the window: what we spent, what came back.
 *
 * WHY THIS EXISTS. Marcus, 2026-09-18: "Our core mission is to turn the survey
 * to report journey break even." Nothing in the digest said how far from break
 * even we are. Measured over the 30 days to 2026-09-18: EUR 1,187.60 of ad spend
 * against EUR 70.00 of revenue from 2 paid reports and one EUR 0 comp — EUR 593.80
 * per paid report, and six cents back per euro. That single line is the business
 * case. (This figure read "3 paid reports — EUR 395.87" until the comp was split
 * out of the denominator; it was 33% flattering, which is why the split exists.)
 *
 * The KPI framework's "Unit Economics" layer — cost per paid report, gross
 * contribution CB I, ROAS/payback — was marked NO DATA because `marketing_spend`
 * is empty. It is, but the spend is not missing: GA4 has it, day by day, already
 * ingested into `brain_chunk` and already read by this same cron for its
 * yesterday-vs-normal line. The KPIs were unreachable only because nothing had
 * joined the two halves.
 *
 * COSTS BEYOND ADVERTISING ARE NOT HERE. Salaries, software and freelancers live
 * in the Business Case spreadsheet and in no database we can read, so CB I here
 * is contribution after MARKETING only — which is what the framework's own
 * formula says ("Total revenue − Marketing budget"). Naming it precisely matters:
 * a reader who takes it for profit is off by roughly EUR 3,000 a month.
 */
export interface UnitEconomics {
  adSpend: number;
  revenue: number;
  /** Unlocks that money was actually paid for. The denominator for cost per sale. */
  paidReports: number;
  /**
   * Unlocks granted at EUR 0 — the post-call coupon and any comp.
   *
   * They count as reports by an explicit decision, and they are NOT sales. Folded
   * into the denominator they make acquisition look cheaper than it is: measured
   * over the 30 days to 2026-09-19, 3 succeeded non-test payments of which ONE
   * was a zero, so cost per sale divided by 3 instead of 2 — 33% flattering, in
   * the direction this file warns about everywhere else.
   */
  compedReports: number;
  /**
   * Succeeded non-test payments in a currency other than EUR, excluded from
   * `revenue` rather than summed into a total labelled EUR. Zero today (53/53
   * are EUR); named so that if one ever appears the line says so instead of
   * quietly adding MXN to euros.
   */
  otherCurrencyReports: number;
  /** Days in the window GA4's AD report actually covers — zero-spend days included. */
  coveredDays: number;
  windowDays: number;
}

/**
 * The Berlin day keys inside `[sinceIso, untilIso)`.
 *
 * NOT `sinceIso.slice(0, 10)`. Both bounds are Berlin midnight expressed in UTC
 * — `2026-09-18T22:00:00.000Z` IS Berlin the 19th — so slicing the string names
 * the day BEFORE the one it bounds, and the spend window came out shifted a
 * whole day off the revenue window. Both were 30 days long, so `coveredDays`
 * still reached 30 and the caveat never fired: a silent one-day mis-attribution
 * on every run, and materially wrong on any day a campaign started or stopped.
 *
 * Stepping lands at NOON, not midnight. Adding 24h to a Berlin-midnight instant
 * gives 23:00 or 01:00 across the DST changeover, and `reportingDay` would then
 * name the wrong day twice a year. Noon is unambiguous in both offsets.
 */
function berlinDaysInWindow(sinceIso: string, untilIso: string): string[] {
  const startMs = Date.parse(sinceIso);
  const endDay = reportingDay(new Date(Date.parse(untilIso)));
  if (!Number.isFinite(startMs)) return [];
  const days: string[] = [];
  for (let i = 0; i < 400; i += 1) {
    const d = reportingDay(new Date(startMs + i * 86_400_000 + 43_200_000));
    if (d >= endDay) break;
    days.push(d);
  }
  return days;
}

export async function fetchUnitEconomics(
  ad: AdCost,
  sinceIso: string,
  untilIso: string,
  windowDays: number
): Promise<UnitEconomics | null> {
  try {
    /**
     * Spend comes from the `AdCost` the handler ALREADY fetched for the spend
     * clause, not a second read of the same `brain_chunk` rows. That read is
     * paginated and keyed on `meta.day` — a true Berlin day — where this one
     * filtered on `period_end` against a sliced timestamp, and the two disagreed
     * about both the window and what "covered" means.
     */
    let adSpend = 0;
    let coveredDays = 0;
    for (const day of berlinDaysInWindow(sinceIso, untilIso)) {
      /**
       * Coverage is the window GA4's AD report reached, which is what
       * `adCovers` answers — not the presence of an `ad_cost` key. A day GA4
       * fully covered on which no campaign ran carries no `ad_cost` at all
       * (`google.ts` writes the key only `...(ad ? {…} : {})`), so keying on it
       * reported a genuinely complete window as partial. `analytics.ts` settled
       * this already: "a day with no spend is still a day we know about".
       */
      if (!adCovers(ad, day)) continue;
      coveredDays += 1;
      adSpend += ad.byDay.get(day) ?? 0;
    }

    /**
     * Revenue and paid reports: SUCCEEDED, NON-TEST payments. Four definitions of
     * "paid report" are defensible (391 / 278 / 79 / 53 all-time) and this is the
     * one recommended for sign-off — the others count test rows, cancellations,
     * or quotes rather than money that arrived.
     */
    const payRes = await supabaseFetch(
      // `currency`, because the sum below is printed as EUR. `funnel-digest`
      // carries the same warning ("mostly EUR, occasionally MXN") and buckets by
      // currency for exactly this reason. 53/53 succeeded non-test rows are EUR
      // today, so this is a guard against a future MXN row silently inflating
      // "earned EUR …" and every ratio built on it — not a bug biting now.
      "/rest/v1/payment?select=amount,currency&status=eq.succeeded&is_test=is.false" +
        `&created_date_time=gte.${encodeURIComponent(sinceIso)}` +
        `&created_date_time=lt.${encodeURIComponent(untilIso)}&limit=1000`
    );
    if (!payRes.ok) {
      logger.warn({ status: payRes.status }, "conversion-digest: revenue read non-2xx");
      return null;
    }
    const payRows = (await payRes.json()) as Array<{ amount?: unknown; currency?: unknown }>;
    let revenue = 0;
    let paidReports = 0;
    let compedReports = 0;
    let otherCurrencyReports = 0;
    for (const row of Array.isArray(payRows) ? payRows : []) {
      const n = typeof row?.amount === "number" ? row.amount : Number(row?.amount);
      if (!Number.isFinite(n)) continue;
      // A missing currency is treated as EUR — every row we have is EUR and the
      // column is nullable on older rows; dropping them would understate revenue.
      const cur = typeof row?.currency === "string" ? row.currency.toUpperCase() : "EUR";
      if (cur !== "EUR") {
        otherCurrencyReports += 1;
        continue;
      }
      revenue += n;
      if (n > 0) paidReports += 1;
      else compedReports += 1;
    }

    return {
      adSpend,
      revenue,
      paidReports,
      compedReports,
      otherCurrencyReports,
      coveredDays,
      windowDays,
    };
  } catch (err) {
    logger.warn({ err }, "conversion-digest: unit economics threw");
    return null;
  }
}

/** Two decimals, thousands separated — the sheet's own presentation. */
function eur(n: number): string {
  return `EUR ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The break-even line, in the order someone reads it: what went out, what came
 * back, and the gap.
 */
export function buildUnitEconomicsLines(u: UnitEconomics): string[] {
  const lines: string[] = [
    `• *Spent* ${eur(u.adSpend)} on ads · *earned* ${eur(u.revenue)} from ${u.paidReports} paid report${u.paidReports === 1 ? "" : "s"}` +
      // Named, not folded in. A comped unlock is a report and is not a sale.
      (u.compedReports > 0 ? ` (plus ${u.compedReports} unlocked free, not counted as sales)` : ""),
  ];

  if (u.otherCurrencyReports > 0) {
    lines.push(
      `_${u.otherCurrencyReports} succeeded payment${u.otherCurrencyReports === 1 ? " is" : "s are"} in another currency and ${u.otherCurrencyReports === 1 ? "is" : "are"} not in the figures above._`
    );
  }

  if (u.paidReports === 0) {
    // Not "EUR 0.00 per report" — dividing by nothing is not a cost of nothing.
    lines.push(`• *Per paid report* — no paid reports in this window, so there is no cost per one`);
  } else if (u.adSpend === 0) {
    /**
     * The guard used to be on `paidReports` alone, so a window with sales and no
     * spend printed "EUR 0.00 to acquire" — the exact "cost of nothing" the
     * branch above exists to refuse, with the sign of a bargain. Reachable
     * whenever ads are paused, or GA4's ad report has not landed.
     */
    lines.push(
      `• *Per paid report* — ${eur(u.revenue / u.paidReports)} earned; no ad spend recorded in this window, so there is no cost to compare it to`
    );
  } else {
    const cppr = u.adSpend / u.paidReports;
    const arpp = u.revenue / u.paidReports;
    const margin = arpp - cppr;
    lines.push(
      `• *Per paid report* — ${eur(cppr)} to acquire, ${eur(arpp)} earned; ` +
        // There was no profitable branch at all: `cppr - arpp` printed "each one
        // costs us EUR -15.00" the moment the product started making money — on
        // the line whose whole job is to announce that.
        (margin >= 0 ? `each one makes us ${eur(margin)}` : `each one costs us ${eur(-margin)}`)
    );
  }

  const contribution = u.revenue - u.adSpend;
  const roas = u.adSpend > 0 ? u.revenue / u.adSpend : null;
  lines.push(
    `• *After marketing* ${eur(contribution)}` +
      (roas === null
        ? ""
        : ` · ${eur(roas)} back per EUR 1 spent` +
          /**
           * Three states, not two. `roas >= 1` printed "EUR 0.00 · above
           * break-even" at exactly 1, and the shortfall multiple was
           * `Math.round(1 / Math.max(roas, 0.0001))` — a clamp that invented
           * "10000x short" out of zero revenue (nothing came back; the honest
           * output is that nothing came back) and CAPPED a genuinely larger
           * shortfall at 10000x, understating the gap, which is the flattering
           * direction this file warns about everywhere else.
           */
          (roas > 1
            ? " — above break-even"
            : roas === 1
              ? " — exactly break-even"
              : roas === 0
                ? ", and nothing came back at all"
                : `, so ${Math.round(1 / roas).toLocaleString("en-US")}x short of break-even`))
  );

  /**
   * Says what it does NOT include. The framework's formula for CB I is revenue
   * minus MARKETING, and a reader who takes this for profit is out by the team,
   * the software and the freelancers — roughly EUR 3,000 a month that lives in a
   * spreadsheet and in no database we can read.
   */
  lines.push(
    "_Advertising only — team, software and freelance costs are in the Business Case sheet, not in any system this reads._"
  );

  if (u.coveredDays < u.windowDays) {
    lines.push(
      `_GA4 reported spend for ${u.coveredDays} of ${u.windowDays} days, so the spend figure is a floor._`
    );
  }
  return lines;
}
