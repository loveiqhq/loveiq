/**
 * GET /api/cron/conversion-digest
 *
 * The daily conversion report asked for in the 2026-08-24 strategy meeting:
 * longitudinal conversion funnels for the landing pages, plus automated alerts on
 * statistical significance and test performance.
 *
 * WHY THIS IS A NEW ROUTE RATHER THAN A REVIVAL. `funnel-digest` already posts a
 * rail of 8-10 charts, and it was unscheduled "per the strategy lead" for being
 * FYI-only (commit 25a9ca64). Two things follow. First, another chart wall gets
 * muted again, so this message leads with a DECISION and puts one chart
 * underneath. Second, `funnel-digest`'s per-arm chart splits on
 * `landing_variant = 'white'` vs everything-else-as-'control' — round 1's shape —
 * so it now plots `white_prev` as "Dark". It must not be un-paused as-is.
 *
 * Significance is computed, never narrated by a model: `twoProportionSignal` plus
 * the TINY_ARM guard, rendered in plain English by `buildArmVerdict`. A language
 * model asked to summarise these numbers can restate one wrongly, and this is a
 * surface people use to decide where to spend money.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`, skipped on the staging host
 * (it shares the prod DB), and idempotent via `slack_alert_sent` keyed by UTC day.
 */

import { NextResponse } from "next/server";
import {
  buildAxisTrends,
  rowsForAxis,
  type AxisFunnelRow,
} from "@features/attribution/server/axis-trends";
import logger from "@shared/observability/logger";
import { notifySlack, escapeSlack, type SlackBlock } from "@shared/observability/slack";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  fitsSlackImageUrl,
  signImagePayload,
  SLACK_IMAGE_URL_MAX,
} from "@shared/url/signed-image-url";
import {
  context,
  divider,
  fields,
  fitBlocks,
  header,
  section,
} from "@shared/observability/slack-blocks";
import {
  markSlackAlertDelivered,
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import { computeRate, fetchFunnelCvrSparklines } from "@features/admin/server/digest-metrics";
import { reportingDay, reportingDayStart } from "@shared/time/reporting-day";
import {
  buildFrictionReport,
  buildFrictionSection,
  surveyQuestionNames,
  type FrictionReport,
} from "@features/admin/server/friction-metrics";
import {
  AMBIGUOUS_VISITOR_ARM,
  type ArmVerdict,
  type AxisCohort,
  type DigestAlert,
  type FunnelStep,
  type LandingArmFunnel,
  type LandingStartFunnel,
  biggestLeak,
  buildAlerts,
  buildArmVerdict,
  buildFunnel,
  delta,
  fetchArmCohorts,
  fetchAxisFunnelDaily,
  fetchLandingArmFunnel,
  fetchLandingStartFunnel,
  fetchMidwayProgress,
  fetchPaywallHits,
  fetchEmailExperimentResults,
  buildEmailExperimentLines,
  type EmailExperimentRow,
  type MidwayProgress,
  type PaywallHits,
  sumDays,
  sumVisitors,
} from "@features/admin/server/conversion-digest";
import { armColor, armLabel, type ExperimentAxis } from "@features/attribution/server/labels";
import { adCostByDay, adCovers } from "@features/brain/server/ingest/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Trends need history to read as trends; matches funnel-digest's window. */
const WINDOW_DAYS = 30;

/**
 * Where "Midway Progress" sits, as a question index.
 *
 * A DEFINITION, not a constant of nature, and Mark owns it. 30 is the literal
 * midpoint of the ~59-question survey as it stood on 2026-09-19. Measured that
 * day: 579 of 1,033 sessions reached question 30, against 697 at question 10 —
 * so the choice moves the number by a lot and should be made against those
 * figures rather than inherited from this line.
 *
 * Named here and echoed onto the funnel row's own label, so the threshold is
 * visible in Slack instead of being a number only the code knows.
 */
export const MIDWAY_QUESTION_INDEX = 30;

/**
 * The axes worth a verdict. `paywall`, `survey` and `pricing` are deliberately
 * absent — all three experiments are concluded (the paywall in favour of the
 * forced wall and then removed entirely, the survey theme in favour of white on
 * 2026-08-25, the price test in favour of the lower arm on 2026-08-31) and
 * nothing randomises any of them any more, so presenting one as a live test is
 * exactly the mistake the /admin dashboard made before it was corrected.
 */
const VERDICT_AXES: ExperimentAxis[] = ["landing"];

/**
 * When report prices last changed. `buildAlerts` uses it to suppress the
 * "conversion dropped" alert around a repricing, where a rate change is expected
 * rather than a regression. Update this on the next price change.
 *
 * 2026-08-31: the higher-priced arm was retired, so every reader moved to the
 * lower price list. That is a repricing for most visitors, hence the new date.
 */
const PRICING_CUTOVER_ISO = "2026-08-31T00:00:00Z";

/**
 * Makes each preview's Slack `kind` distinct so notifySlack's 60-second dedup
 * (which keys on channel + kind + the first 100 chars of the fallback text)
 * cannot swallow a repeat send while the wording is being iterated on.
 *
 * A counter rather than a timestamp alone: two previews inside the same
 * millisecond produced the same kind, and the whole point is that a second look
 * always arrives.
 */
let previewSequence = 0;

function deployStamp(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha && sha.length >= 7) return sha.slice(0, 7);
  return `dev-${process.env.HOSTNAME ?? "local"}`;
}

/**
 * Slack's image proxy is anonymous, so authenticity has to travel in the URL.
 * `v` is the deploy stamp, which busts the proxy cache on each deploy.
 */
/**
 * Every chart in this digest is drawn by the two-arm renderer, including the
 * single-series ones — it has an axis, gridlines and a shared scale, and its solo
 * mode exists precisely so a second renderer was not needed.
 *
 * This used to take a `kind` parameter offering `cvr-visitor-start`, the
 * longitudinal renderer from funnel-digest, and its doc comment said that one was
 * "reused here rather than reimplemented". No call site ever passed it, and the
 * decision was reversed in the same file 480 lines below — the sparkline renderer
 * was abandoned because a 6% rate and a 0.6% rate drew byte-identical plots on it.
 * Two comments contradicting each other with a dead union type between them.
 */
async function signedChartUrl(payload: Record<string, unknown>): Promise<string | null> {
  const kind = "conversion-by-arm";
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) {
    logger.warn("conversion-digest: NEXT_PUBLIC_SITE_URL unset; skipping chart");
    return null;
  }
  try {
    const { d, s } = await signImagePayload({
      kind,
      v: deployStamp(),
      ...payload,
    });
    const u = new URL(`/api/admin/digest-image/${kind}`, base);
    u.searchParams.set("d", d);
    u.searchParams.set("s", s);
    const url = u.toString();
    // Over Slack's cap the block is rejected and the WHOLE post fails.
    if (!fitsSlackImageUrl(url)) {
      logger.warn(
        { kind, length: url.length, max: SLACK_IMAGE_URL_MAX },
        "conversion-digest: signed URL over Slack's image_url cap; skipping chart"
      );
      return null;
    }
    return url;
  } catch (err) {
    logger.warn({ err }, "conversion-digest: chart signing failed; skipping chart");
    return null;
  }
}

/** "3 Aug" — short enough for ~5 x-axis ticks. */
function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

/**
 * Step names carry an "…of those," prefix so each row states what its number
 * actually is, but that reads badly inside a sentence — "Biggest drop: …of
 * those, opened their report → …of those, started checkout".
 */
function shortStep(step: string): string {
  return step.replace(/^…of those,\s*/, "");
}

function money(amount: number): string {
  return `EUR ${amount.toFixed(2)}`;
}

/**
 * A two-arm trend chart series: a per-day conversion rate for two arms, on a
 * shared y-scale.
 *
 * Daily rates on a handful of conversions are extremely spiky, so this plots a
 * 7-day TRAILING rate — a single purchase on a 3-completion day is 33%, which
 * would dominate the y-scale and make the chart lie about the trend.
 *
 * Generic in the numerator and in the row type, because one shape serves every
 * axis chart: completion→checkout for each live experiment axis. One builder
 * means the trailing window and the null-gap rule below cannot drift between
 * them.
 */
export function buildArmSeries<T extends { arm: string; day: string; completions: number }>(
  rows: T[],
  arms: [string, string],
  numerator: (row: T) => number
): { labels: string[]; first: Array<number | null>; last: Array<number | null> } {
  const days = Array.from(new Set(rows.map((r) => r.day))).sort();
  const dayIndex = new Map(days.map((day, i) => [day, i]));

  /**
   * A day with NO finishers in the arm's trailing window returns null, not 0.
   *
   * Zero and "not running" are different facts and the chart cannot say so if
   * they share a value. The second landing page arm only began on 2026-08-21, so
   * filling its earlier days with 0% drew a flat line a month long and claimed a
   * month of zero conversion for an arm that did not exist — which is exactly
   * how the first version read.
   */
  const rateFor = (arm: string): Array<number | null> =>
    days.map((_, idx) => {
      /**
       * The first six days have no full window behind them, so they are gaps.
       *
       * Without this the opening points are 1-, 2-, ... 6-day rates drawn on a
       * chart whose footnote promises a 7-day trailing one. Measured on the real
       * survey data, day one was 7 checkouts from 12 finishers = 58%, against a
       * true trailing rate of 10-17% for the rest of the month — so the warm-up
       * artefact set the y-scale, squashed every real value into the bottom
       * sixth of the plot, and drew a dramatic month-long "decline" that was
       * nothing but the window filling up.
       */
      if (idx < 6) return null;
      const from = idx - 6;
      let completions = 0;
      let converted = 0;
      for (const row of rows) {
        if (row.arm !== arm) continue;
        const i = dayIndex.get(row.day);
        if (i === undefined || i < from || i > idx) continue;
        completions += row.completions;
        converted += numerator(row);
      }
      return completions > 0 ? computeRate(converted, completions) : null;
    });

  return {
    labels: days.map(shortDay),
    first: rateFor(arms[0]),
    last: rateFor(arms[1]),
  };
}

/**
 * Site-wide visits → survey-started, as a 7-day trailing rate.
 *
 * No arm split, and that is the point: per-arm labelling of the survey-start
 * event only began on 2026-08-24, so the A/B version of this metric is days old,
 * while the site-wide version reaches back as far as the window does. This is
 * "how is the trend looking"; the per-arm comparison is a separate block that
 * fills in on its own.
 *
 * Reuses `get_funnel_cvr_sparklines`, which already returns visitors + starts per
 * UTC day for the funnel digest — no new RPC for a series that was already being
 * computed and simply never shown here.
 */
export function buildSiteStartSeries(
  days: Array<{ day: string; visitors: number; starts: number }>
): {
  labels: string[];
  values: Array<number | null>;
} {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  return {
    labels: sorted.map((d) => shortDay(d.day)),
    values: sorted.map((_, idx) => {
      // Same warm-up rule as the other trailing series: a window without seven
      // days behind it is not the rate the footnote promises.
      if (idx < 6) return null;
      let visitors = 0;
      let starts = 0;
      for (let i = idx - 6; i <= idx; i += 1) {
        visitors += sorted[i]!.visitors;
        starts += sorted[i]!.starts;
      }
      return visitors > 0 ? computeRate(starts, visitors) : null;
    }),
  };
}

/**
 * Visits -> survey-started per day, per arm, as a 7-day trailing rate.
 *
 * `null` for any day the arm had no visits, so an arm that had not launched is a
 * GAP rather than a plotted zero. Trailing rather than daily because a handful of
 * starts on a low-traffic day swings a daily rate wildly.
 */
/**
 * Midway daily rows in the shape `buildStartSeries` already understands.
 *
 * sessions -> visits, reached -> starts. Mapping rather than duplicating keeps
 * ONE implementation of the 7-day trailing window and its warm-up gap; the rule
 * that the first six days are gaps rather than partial windows was already
 * missing from one of these two builders once.
 */
export function buildMidwaySeries(
  midway: MidwayProgress,
  arms: [string, string]
): { labels: string[]; first: Array<number | null>; last: Array<number | null> } {
  return buildStartSeries(
    {
      daily: midway.daily.map((r) => ({
        day: r.day,
        arm: r.arm,
        visits: r.sessions,
        starts: r.reached,
      })),
      totals: [],
    },
    arms
  );
}

export function buildStartSeries(
  funnel: LandingStartFunnel,
  arms: [string, string]
): { labels: string[]; first: Array<number | null>; last: Array<number | null> } {
  const days = Array.from(new Set(funnel.daily.map((r) => r.day))).sort();
  const dayIndex = new Map(days.map((day, i) => [day, i]));
  const rateFor = (arm: string): Array<number | null> =>
    days.map((_, idx) => {
      /**
       * The first six days are gaps, not partial windows.
       *
       * Same rule as `buildArmSeries`, and it was missing here: this builder
       * averaged whatever it had — a 1-day, then 2-day, then 3-day window — and
       * the footnote underneath called all of them a "7-day trailing" rate.
       * Measured on the sibling chart's real data, a warm-up point read 58%
       * against a true 10-17%, which then set the y-scale and squashed every
       * honest value into the bottom sixth of the plot.
       */
      if (idx < 6) return null;
      const from = idx - 6;
      let visits = 0;
      let starts = 0;
      for (const row of funnel.daily) {
        if (row.arm !== arm) continue;
        const i = dayIndex.get(row.day);
        if (i === undefined || i < from || i > idx) continue;
        visits += row.visits;
        starts += row.starts;
      }
      return visits > 0 ? computeRate(starts, visits) : null;
    });
  return {
    labels: days.map(shortDay),
    first: rateFor(arms[0]),
    last: rateFor(arms[1]),
  };
}

interface DigestInput {
  dayKey: string;
  funnel: LandingArmFunnel | null;
  cohorts: AxisCohort[] | null;
  /** Landing -> survey-start. Null until its migration is applied. */
  startFunnel?: LandingStartFunnel | null;
  /**
   * Midway Progress. Null until its migration is applied, which omits the funnel
   * row rather than printing a zero for a step that is measured.
   *
   * REQUIRED, not optional, and that is the point. `scripts/preview-slack-message.mts`
   * builds this same input from its own copy of the fetch list, and every other
   * field here is optional — so when this one was added to the cron the preview
   * still compiled, still ran, and silently rendered a digest missing a section
   * that the real message now has. A preview that can disagree with the message it
   * previews is worse than no preview: it is a message you believe you have
   * checked. Passing `null` explicitly is fine; forgetting it is not.
   */
  midway: MidwayProgress | null;
  /**
   * Paywall Hits — Mark's sixth funnel step. REQUIRED for the same reason
   * `midway` is: the preview script builds this same input from its own fetch
   * list, and an optional field lets it silently render a funnel the real message
   * does not have. Passing null explicitly is fine; forgetting it is not.
   */
  paywall: PaywallHits | null;
  /**
   * Per-arm results for the email A/B tests. Required, same reason as the two
   * above: an optional field lets the preview render a message the real one
   * does not have.
   */
  emailExperiments: EmailExperimentRow[] | null;
  /** Per-day, per-arm rows for every live axis. [] when the RPC is unavailable. */
  axisRows?: AxisFunnelRow[];
  /** Site-wide visitors + starts per day, for the landing→survey trend line. */
  cvrDays?: Array<{ day: string; visitors: number; starts: number }> | null;
  /**
   * What was spent on ads on `dayKey`, or NULL when GA4 does not cover that day.
   *
   * Null is "unknown", never zero — the same rule the rest of the analytics layer keeps,
   * and it matters most here: "0 paid, EUR 0.00 spent" reads as a quiet day, while the
   * truth may be "0 paid, EUR 42 spent". An absent figure omits the clause entirely
   * rather than inventing a reassuring one.
   */
  adSpend?: number | null;
  /**
   * The friction scoreboard — Marcus's 22 signals. Null when the aggregates are
   * unavailable, which omits the section rather than printing an empty table.
   */
  friction?: FrictionReport | null;
  now: Date;
}

export interface BuiltDigest {
  text: string;
  blocks: SlackBlock[];
  trimmed: boolean;
}

export async function buildConversionDigest(input: DigestInput): Promise<BuiltDigest> {
  const { dayKey, funnel, cohorts, now, cvrDays } = input;
  const startFunnel = input.startFunnel ?? null;
  const midway = input.midway;
  const paywall = input.paywall;
  const emailExperiments = input.emailExperiments;
  const axisRows = input.axisRows ?? [];
  const windowLabel = `${WINDOW_DAYS}-day window ending ${dayKey} Berlin time`;

  const verdicts: ArmVerdict[] = [];
  if (cohorts) {
    for (const axis of VERDICT_AXES) {
      const rows = cohorts
        .filter((c) => c.axis === axis && c.arm !== "unknown")
        .map((c) => ({ arm: c.arm, n: c.n, conversions: c.conversions }));
      if (rows.length === 0) continue;
      verdicts.push(buildArmVerdict(axis, rows));
    }
  }

  const blocks: SlackBlock[] = [header(`📈 Conversion — ${dayKey}`)];
  // Definitions ride at the TOP, not the bottom. fitBlocks keeps from the front,
  // so as the last block this was the first thing dropped when a message ran
  // long — leaving every number in place and no statement of what any of them
  // meant.
  /**
   * The funnel spans TWO spans, and says so rather than implying one.
   *
   * Rows down to "Finished the survey" count events inside the window. The
   * "…of those" rows below follow those finishers FORWARD with no end date, so a
   * purchase after the window closes still counts.
   *
   * WHY NOT BOUND THEM TO THE WINDOW and make it one span. Because that trades a
   * labelling problem for a measurement one: a person who finished on day 29 has a
   * day to buy, against thirty for someone who finished on day 1, and the nurture
   * sequence does not even finish emailing them until 78h in. Truncating would
   * under-report conversion for every recent cohort and make the funnel appear to
   * decline whenever traffic grows. Measured 2026-09-15 the unbounded reading costs
   * exactly one row of difference — 33 reached checkout ever against 32 inside the
   * window, and 5 paid either way — so the honest fix is to name the two spans,
   * not to distort the number to force one.
   */
  blocks.push(
    context(
      `${windowLabel} · "visits" are visitor-days on any page, not people · rows down to ` +
        `"Finished the survey" count the window; the "…of those" rows follow those finishers ` +
        `forward with no end date`
    )
  );

  /**
   * "Where the tests stand" used to sit here: a 30-day, paid-based verdict per
   * axis. It is gone because the per-test section below reported the same tests
   * again on their own like-for-like windows and a different metric, and two
   * verdicts per test that disagree is worse than one — it took an alert to
   * explain which of them to ignore.
   *
   * Nothing decision-relevant is lost. Paid counts are on each arm's own line
   * below, and for pricing and landing the 30-day figure pooled a price change
   * and a different pair of arms respectively — exactly the number that should
   * not be quoted.
   *
   * A FAILED read still has to speak, though: silence would read as "no tests
   * running" rather than "we could not measure them".
   */
  if (cohorts === null) {
    blocks.push(
      section("*Could not read the experiment data* — a measurement failure, not a result.")
    );
  }

  // ---- Yesterday vs the usual ----
  let yesterday = { visitors: 0, completions: 0, paid: 0 };
  let baseline = { visitors: 0, completions: 0, paid: 0 };
  if (funnel) {
    const y = sumDays(funnel.daily, (d) => d === dayKey);
    const yVisitors = sumVisitors(funnel.visitors, (d) => d === dayKey);
    // Prior 7 days, as a daily average, so "yesterday" is compared with a normal
    // day rather than with a single (possibly freak) previous day.
    const priorDays: string[] = [];
    for (let i = 1; i <= 7; i += 1) {
      const d = new Date(`${dayKey}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      priorDays.push(d.toISOString().slice(0, 10));
    }
    const p = sumDays(funnel.daily, (d) => priorDays.includes(d));
    const pVisitors = sumVisitors(funnel.visitors, (d) => priorDays.includes(d));

    yesterday = { visitors: yVisitors, completions: y.completions, paid: y.paid };
    baseline = {
      visitors: pVisitors / 7,
      completions: p.completions / 7,
      paid: p.paid / 7,
    };

    blocks.push(divider());
    blocks.push(section("*Yesterday vs a normal day*"));
    blocks.push(
      fields([
        { label: "Visits", value: `${yVisitors}  _(${delta(yVisitors, pVisitors / 7)})_` },
        {
          label: "Finished survey",
          value: `${y.completions}  _(${delta(y.completions, p.completions / 7)})_`,
        },
        { label: "Paid", value: `${y.paid}  _(${delta(y.paid, p.paid / 7)})_` },
        {
          label: "Revenue",
          value: `${money(y.revenue)}  _(${delta(y.revenue, p.revenue / 7)})_`,
        },
      ])
    );
  }

  // ---- The funnel ----
  let steps: FunnelStep[] = [];
  if (funnel) {
    // Visits are attributable to an arm only from the recordVisit fix onwards, but
    // the TOTAL is sound either way, so the whole-population funnel uses it.
    const totalVisits = funnel.visitors.reduce((t, v) => t + v.n, 0);
    // Survey starts come from the sparkline source, which reports the same visit
    // and finisher totals as the funnel either side of the new row. Null when that
    // read failed, in which case the row is omitted rather than drawn as zero.
    const startsTotal = cvrDays?.reduce((t, d) => t + d.starts, 0) ?? null;
    steps = buildFunnel(
      funnel.cohort,
      totalVisits,
      startsTotal,
      midway ? { reached: midway.overall.reached, index: midway.midwayIndex } : null,
      paywall?.hits ?? null
    );
    // Skip the visits -> finished step. It is the largest drop by construction
    // (most visitors never start a survey) and would be the headline every single
    // day, which is how a digest becomes wallpaper. The full funnel is printed
    // right below, so nothing is hidden — only the HEADLINE moves to a step
    // someone can act on.
    const leak = biggestLeak(steps.slice(1));
    blocks.push(divider());
    /**
     * A non-zero count whose share rounds to nothing prints "<0.1", never "0".
     * With 5 payments against 12,308 visits the share is 0.04%, and a column
     * reading 100 / 8.3 / 3.5 / 3.4 / 0.3 / 0 invites exactly one conclusion —
     * that nobody paid — while the count beside it says five. Same rule the
     * charts already follow: zero and nearly-zero are different facts.
     */
    /**
     * The share of `of`, as the table prints it. NOT `computeRate`.
     *
     * `computeRate` is right for a chart and wrong for this table, in two ways
     * that both produce a confident wrong number:
     *
     *   * it CLAMPS to 100. buildFunnel deliberately leaves the last three steps
     *     unclamped, because a promo one-tap or an admin-granted unlock sets
     *     purchased_at without a checkout — so paid CAN exceed checkout truthfully.
     *     6 paid from 5 checkouts printed "100%" and hid a real 120%, in the one
     *     column that exists to say what happened between two steps.
     *   * it returns 0 for a zero denominator, which this table then rendered as
     *     "<0.1%" — a vanishing ratio, for a ratio that does not exist. Reachable
     *     by the same promo path: 0 checkouts, 1 paid.
     *
     * A number over 100 is shown as it is. It means the two rows are not a subset
     * of each other, which is a fact about the funnel worth seeing rather than
     * rounding away.
     */
    const share = (count: number, of: number): string => {
      if (of <= 0) return "—";
      const raw = (count / of) * 100;
      // A non-zero count whose share rounds to nothing prints "<0.1%", never "0".
      // With 5 payments against 12,308 visits the share is 0.04%, and a column
      // reading 100 / 8.3 / 3.5 / 3.4 / 0.3 / 0 invites exactly one conclusion —
      // that nobody paid — while the count beside it says five.
      if (raw > 0 && raw < 0.05) return "<0.1%";
      return `${Math.round(raw * 10) / 10}%`;
    };
    /**
     * BOTH percentages, on every row, each one named — asked for on the 2026-09-16
     * sync ("consistent percentage labels across all visual graphs", and funnel
     * steps stating either the step-by-step or the cumulative conversion).
     *
     * The table used to print the cumulative share bare and the step figure as a
     * "▼ 45%" suffix, and named neither. That is precisely how a 96.5% turned up in
     * a meeting with nobody able to say 96.5% of WHAT: it was the drop from all
     * visits to a finished survey, sitting in a column of numbers measured against
     * a different base. Two named columns cost one context line and remove the
     * whole class of question.
     *
     * The step column is a CONVERSION, not a drop — "65.5% carried on", not "34.5%
     * left" — because that is the direction the rest of the report, the framework
     * sheet and the meeting all speak in. It is computed from the counts rather
     * than as 100 minus the rounded drop, so the two columns cannot disagree by a
     * rounding step.
     */
    const top = steps[0]?.count ?? 0;
    const rows = steps.map((s, i) => {
      const prev = i === 0 ? null : steps[i - 1]!;
      const stepPct = prev ? share(s.count, prev.count) : "—";
      const allPct = share(s.count, top);
      return `\`${String(s.count).padStart(6)}  ${stepPct.padStart(6)}  ${allPct.padStart(6)}\`  ${escapeSlack(s.step)}`;
    });
    // Heading, headline and table in ONE block. Split across two, Slack put a
    // paragraph gap between the title and the numbers it titles.
    blocks.push(
      section(
        [
          `*The funnel — ${WINDOW_DAYS} days*${
            leak
              ? `  ·  biggest drop ${escapeSlack(shortStep(leak.from))} → ${escapeSlack(shortStep(leak.to))}, losing ${leak.pct}%`
              : ""
          }`,
          rows.join("\n"),
          "_people  ·  % of the step before  ·  % of all visits_",
        ].join("\n")
      )
    );
  }

  /**
   * The friction scoreboard, directly under the funnel it explains.
   *
   * The funnel table says WHERE people are lost between steps; this says what
   * they were doing when it happened. Kept to one section and one fenced table
   * on purpose: `funnel-digest` was unscheduled for being a rail of charts with
   * no decision attached, and fifteen pictures would repeat that with a new
   * name.
   */
  if (input.friction && input.friction.signals.length > 0) {
    blocks.push(section(buildFrictionSection(input.friction, WINDOW_DAYS)));
  }

  /**
   * Landing → survey, SITE-WIDE. The trend line, sitting with the funnel above
   * rather than under *The tests*, because it is not an A/B result — it is the
   * whole site's visits→started rate over the window.
   *
   * It exists here because the per-arm version cannot be a trend yet: the
   * survey-start event only began carrying a landing arm on 2026-08-24. This one
   * reaches back as far as the window does, from `get_funnel_cvr_sparklines` —
   * an RPC that has been computing visitors + starts per day all along for the
   * funnel digest, a cron that is not currently scheduled, which is why nobody
   * has seen this line.
   */
  if (cvrDays && cvrDays.length > 0) {
    const site = buildSiteStartSeries(cvrDays);
    const real = site.values.filter((v): v is number => v != null);
    if (real.length > 0) {
      /**
       * Drawn by the ARM renderer in single-series mode, not by the sparkline
       * one it started on. That renderer pinned its y-scale to the series' own
       * max with no axis labels, which was measured: re-rendering the same shape
       * at a tenth of the magnitude produced a byte-identical plot — a 6% rate
       * and a 0.6% rate drew the same picture, and the only thing that moved was
       * a 98x10px text readout. Three earlier commits fixed gridlines, tick
       * alignment, the clipped peak and the rounding in the arm renderer and
       * never touched the other one, so this metric was promoted onto the
       * pre-audit code path.
       *
       * Nulls are passed straight through now: the arm renderer draws them as
       * gaps, so the six warm-up days need no slicing and — the part that
       * actually mattered — an interior null from a day with no visitors stays a
       * gap instead of being flattened to a plotted 0%.
       */
      const latest = real[real.length - 1]!;
      const peak = Math.max(...real);
      const direction =
        peak - latest >= 1
          ? ` — down from ${peak}% at its peak this window`
          : latest - Math.min(...real) >= 1
            ? ` — up from ${Math.min(...real)}% this window`
            : "";
      const url = await signedChartUrl({
        windowLabel,
        labels: site.labels,
        first: site.values,
        // No `last` key at all: single-series mode. An all-null `last` would be a
        // second arm with no data, which is a different statement.
        title: "Visits that reach the survey",
        legendFirst: "Visits that reach the survey",
        /**
         * Slate, not the categorical blue. This is the site TOTAL, not an arm, and
         * it sits two blocks above a chart where blue means Landing Page V1 — the
         * same "follow the coloured line across two charts and you are following
         * two different things" problem the per-arm colours were bound to fix.
         * 10.35:1 on white.
         */
        colorFirst: "#334155",
        headline: `${latest}% of visits reach the survey${direction}`,
        footnote:
          "survey starts ÷ all-page visit-days, 7-day trailing · a gap is a day with no visits",
        emptyLabel: "Awaiting data — no visits recorded in this window yet.",
      });
      if (url) {
        blocks.push(
          section(
            `*Visits that reach the survey* — ${latest}% of visit-days, 7-day trailing${direction}.`
          )
        );
        blocks.push({
          type: "image",
          image_url: url,
          alt_text: `Site-wide share of visit-days that reach the survey questions, 7-day trailing, over the reporting window. Currently ${latest}%, peak ${peak}%.`,
        });
      }
    }
  }

  /**
   * Landing → survey start. Built here, RENDERED inside *The tests* below.
   *
   * A landing page's job is to get someone into the survey, which the
   * finished→paid axes cannot measure — so this is the picture the section
   * leads with. It is a TREND, not a verdict, and the caption says so in one
   * line, because the two arms do not sit at the same funnel step: the current
   * landing's inline question (white/WQuestionCard.tsx) writes an answer to
   * localStorage and SurveyPage.loadInitialStep() skips straight to the engine,
   * while the previous landing's visitors clear an intro, four slides and a
   * consent screen first. Two further biases, in writing so nobody has to
   * rediscover them: the denominator counts every public page, so a buyer
   * re-reading their report adds visit-days to the arm that sold it and can
   * never add a start — which pushes the OPPOSITE way to the first bias, so the
   * sign of the gap is unknown, not merely noisy; and the numerator needs
   * analytics consent while the denominator does not.
   *
   * The honest fix is one arm-symmetric, path-scoped, server-side event pair at
   * arrival on /survey. It needs RSC-navigation detection in proxy.ts, because
   * both landings link with next/link and a soft navigation is not a document
   * request. Until then: trend, caveat, no verdict.
   */
  /**
   * Midway Progress per landing page.
   *
   * Reuses `buildStartSeries` by mapping sessions->visits and reached->starts: the
   * shape is identical and the 7-day trailing rule, including its warm-up gap, is
   * the part with the bug history. A second copy of that loop is how the two
   * versions drift.
   *
   * EMPTY IS A SENTENCE, NOT A PICTURE. Drafts only started carrying an arm on
   * `firstArmDay`, so for the first week there is nothing to plot. `funnel-digest`
   * was unscheduled for being a rail of charts with no decision attached, and an
   * empty chart that says "awaiting data" every morning for a week is that same
   * mistake with a new name. One line until there is something to show.
   */
  const midwayBlocks: SlackBlock[] = [];
  /**
   * ONE trust decision, two surfaces.
   *
   * `buildFunnel` drops the midway row when the sources disagree — midway below
   * the finisher count means draft saves and the submission cohort are measuring
   * different populations. Without this gate the funnel stayed silent about
   * midway while the block below printed per-arm midway numbers anyway, so the
   * message both withheld and asserted the same figure. Reading the rendered
   * steps rather than recomputing the condition keeps them from drifting apart.
   */
  const midwayRowShown =
    !!midway && steps.some((step) => step.step === `Reached question ${midway.midwayIndex}`);
  if (midway && midwayRowShown) {
    const armTotal = (arm: string) => midway.totals.find((t) => t.arm === arm);
    const named = (["white_prev", "white"] as const).filter(
      (a) => (armTotal(a)?.sessions ?? 0) > 0
    );

    if (named.length > 0) {
      const line = named
        .map((arm) => {
          const t = armTotal(arm)!;
          return `• *${armLabel("landing", arm).short}* — ${t.reached} of ${t.sessions} drafts reached question ${midway.midwayIndex} (${computeRate(t.reached, t.sessions)}%)`;
        })
        .join("\n");
      /**
       * The unattributed drafts are named, not dropped.
       *
       * The RPC buckets arm-less rows as 'unknown' so the arms always sum to the
       * total — and this caller then filtered to the two live arms, which quietly
       * defeated the reason the bucket exists: the printed lines did not add up to
       * `overall.sessions` and nothing on screen said why. A visitor with no
       * landing cookie is a crawler, a direct hit or a consent refusal; that is a
       * real population and hiding it makes the split look cleaner than it is.
       */
      const unknown = armTotal("unknown");
      const unattributed =
        unknown && unknown.sessions > 0
          ? `\n• _no landing page recorded_ — ${unknown.reached} of ${unknown.sessions} drafts (${computeRate(unknown.reached, unknown.sessions)}%)`
          : "";
      midwayBlocks.push(section(`*Midway progress, by landing page*\n${line}${unattributed}`));

      const series = buildMidwaySeries(midway, ["white_prev", "white"]);
      const hasReal = series.first.some((v) => v != null) || series.last.some((v) => v != null);
      if (hasReal && series.labels.length > 1) {
        const url = await signedChartUrl({
          windowLabel,
          labels: series.labels,
          first: series.first,
          last: series.last,
          title: `Drafts reaching question ${midway.midwayIndex}, by landing page`,
          legendFirst: armLabel("landing", "white_prev").short,
          legendLast: armLabel("landing", "white").short,
          colorFirst: armColor("landing", "white_prev"),
          colorLast: armColor("landing", "white"),
          headline: named
            .map(
              (a) =>
                `${armLabel("landing", a).short} ${armTotal(a)!.reached}/${armTotal(a)!.sessions}`
            )
            .join("  ·  "),
          footnote: `reached ÷ drafts saved, 7-day trailing · peak {peak}%`,
        });
        if (url) {
          midwayBlocks.push({
            type: "image",
            image_url: url,
            alt_text: `Share of survey drafts reaching question ${midway.midwayIndex}, per landing page, over the reporting window`,
          });
        }
      }
    } else if (midway.firstArmDay) {
      // Says WHY it is empty and WHEN it starts, so nobody reads the absence as
      // "no one gets halfway".
      midwayBlocks.push(
        context(
          `Midway progress per landing page starts from ${escapeSlack(midway.firstArmDay)} — before that, drafts did not record which landing page the visitor came from.`
        )
      );
    }
  }

  const landingStartBlocks: SlackBlock[] = [];
  if (startFunnel) {
    /**
     * V1 then V2, so the message reads in version order.
     *
     * This used to be sorted by label, and the sort was load-bearing: the renderer
     * coloured by POSITION, so the order the arms were passed in decided which one
     * was blue. Sorting made two charts in one message agree — but it could not
     * help on a day when one arm had no traffic and was dropped, because there was
     * no second arm left to sort against, and the survivor took the first slot's
     * colour. Colour is now bound to the arm itself (`armColor`), so ORDER HERE IS
     * ONLY READING ORDER and changing it cannot repaint anything.
     */
    const liveArms: [string, string] = ["white_prev", "white"];
    const series = buildStartSeries(startFunnel, [liveArms[0], liveArms[1]]);
    const totalFor = (arm: string) => startFunnel.totals.find((t) => t.arm === arm);
    const hasVisits = (arm: string) => (totalFor(arm)?.visits ?? 0) > 0;
    const armLine = (arm: string) => {
      const label = armLabel("landing", arm).short;
      const row = totalFor(arm);
      if (!row || row.visits === 0) return `• *${label}* — no visits recorded yet`;
      return `• *${label}* — ${row.visits} visit-days → ${row.starts} started the survey`;
    };
    /**
     * Both directions, in one line. The step mismatch flatters V2; the all-page
     * denominator penalises whichever arm sold reports, since a buyer re-reading
     * theirs adds visit-days and can never add a start. Naming only the first — as a
     * shorter version of this did — leaves the reader with a caveat that points one
     * way when the real answer is that the direction is unknown.
     *
     * Names the arm rather than "the current design": that phrase was a second name
     * for V2 in a message whose other lines already call it V2, and it is the phrase
     * marketing's naming convention exists to retire.
     */
    const caveat =
      "Not a like-for-like comparison: V2's inline question puts its visitors straight into the survey, and the denominator counts every page rather than landing views — the two pull opposite ways, so treat the gap as unknown. Returning visitors also keep the design they first saw, which warms V2's traffic further.";
    const hasAny = series.first.some((v) => v != null) || series.last.some((v) => v != null);

    if (hasAny && series.labels.length > 1) {
      const url = await signedChartUrl({
        windowLabel,
        labels: series.labels,
        first: series.first.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
        last: series.last.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
        // "Site visit-days", not "landing page": the denominator is every public
        // page, split by the landing cookie, not landing-page views. The previous
        // title said so and the shorter one quietly stopped being true.
        title: "Site visit-days → started the survey, by landing page",
        legendFirst: armLabel("landing", liveArms[0]).short,
        legendLast: armLabel("landing", liveArms[1]).short,
        colorFirst: armColor("landing", liveArms[0]),
        colorLast: armColor("landing", liveArms[1]),
        // Labelled. Unlabelled fractions ("12/300 · 3/90 started") are ambiguous
        // in the image alone, and the image is what gets forwarded.
        headline: `${armLabel("landing", liveArms[0]).short} ${totalFor(liveArms[0])?.starts ?? 0}/${totalFor(liveArms[0])?.visits ?? 0}  ·  ${armLabel("landing", liveArms[1]).short} ${totalFor(liveArms[1])?.starts ?? 0}/${totalFor(liveArms[1])?.visits ?? 0}`,
        // One clause, not five. The full reasoning is in the comment above this
        // block; a footnote is read at a glance on a phone, where the old
        // five-clause version was an illegible grey band.
        footnote: "starts ÷ all-page visit-days, 7-day trailing · peak {peak}%",
      });
      if (url) {
        // The counts ride in the CAPTION as well as the image headline. Slack can
        // fail to load an image, and the caption is the accessible text — a
        // caveat with no numbers next to it is not worth reading.
        const countOf = (arm: string) => {
          const row = totalFor(arm);
          return row ? `${row.starts}/${row.visits}` : "no visits";
        };
        landingStartBlocks.push(
          section(
            `*Landing page → survey* — ${armLabel("landing", liveArms[0]).short} ${countOf(liveArms[0])} started · ${armLabel("landing", liveArms[1]).short} ${countOf(liveArms[1])}. ${caveat}`
          )
        );
        landingStartBlocks.push({
          type: "image",
          image_url: url,
          alt_text:
            "Started-the-survey rate per landing page arm over the reporting window. A trend, not a verdict — the two arms measure different funnel steps.",
        });
      }
    } else if (!hasVisits(liveArms[0]) && !hasVisits(liveArms[1])) {
      /**
       * Nothing for EITHER live arm. ONE line — four lines of "no visits recorded
       * yet" is the daily filler that teaches people to skim the whole message.
       *
       * Gated on visits, not on label count. `liveArms` is hardcoded, so a window
       * whose rows are all `unknown`/`control` — an arm rename, say — has plenty
       * of labels and no arm data, and the count branch below would then report
       * "10 days of per-arm data" above two empty bullets.
       */
      landingStartBlocks.push(
        section("*Landing page → survey* — no per-arm data in this window yet.")
      );
    } else {
      /**
       * Counts until the trailing rate has seven days behind it — the same
       * treatment the other young axes get, and visible from the first day
       * rather than an empty slot and a promise.
       *
       * The date is derived, not written down. The window is half-open and ends
       * at yesterday, so a day only enters the series in the FOLLOWING run: the
       * first day of data plus six more makes seven labels, and the digest that
       * carries them is one further day on. Every attempt to state that as a
       * constant has been off by a day.
       */
      const days = series.labels.length;
      /**
       * Counted forward from the LAST day of data, not the first.
       *
       * From the first, the promise is fixed the moment the series starts — so a
       * window with a missing day names a date the chart cannot make, and one
       * that never accumulates a seventh day repeats a date in the past every
       * morning. From the last, the arithmetic is "how many more days do we
       * need", which is the actual question. Still +1 on top, because the window
       * is half-open and ends yesterday: a day only enters the series in the
       * following run.
       */
      const lastDay = [...new Set(startFunnel.daily.map((r) => r.day))].sort().at(-1)!;
      const readyOn = new Date(`${lastDay}T00:00:00Z`);
      readyOn.setUTCDate(readyOn.getUTCDate() + (7 - days) + 1);
      const readyLabel = `${readyOn.getUTCDate()} ${readyOn.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
      // And no promise at all once the window is full but the line still cannot
      // be drawn — that is not a waiting game, it is a different problem.
      const readyClause = days < 7 ? ` · chart from ${readyLabel}` : "";
      landingStartBlocks.push(
        section(
          [
            `*Landing page → survey* — ${days === 1 ? "one day" : `${days} days`} of per-arm data${readyClause}`,
            armLine(liveArms[0]),
            armLine(liveArms[1]),
            `• ${caveat}`,
          ].join("\n")
        )
      );
    }
  } else {
    landingStartBlocks.push(
      context(
        "_Landing page → survey is not available right now — its data source did not answer._"
      )
    );
  }

  // The landing axis had its own purchases-per-finished-survey chart here. It is
  // gone, and the per-axis section below is the only place landing is charted.
  //
  // Three of that chart's own rules said not to draw it. Its purple line ran from
  // 26 Jul under the legend for the current arm, but V2 only exists since the
  // 10 Aug rebuild and the round-2 comparison since 21 Aug
  // (AXIS_VALID_FROM.landing) — so most of that line was V1 traffic wearing V2's
  // label, next to a 4-day stub of the other arm
  // flat on zero. It also drew purchases, which the section below refuses to draw
  // below MIN_PAID_TO_DRAW, from the same 10 the captions call too few. A message
  // cannot both show a landing chart and say landing has no chart yet.

  // ---- One chart per live A/B test ----
  //
  // Each axis is gated on its own data (see buildAxisTrends): an axis whose
  // comparison is too young, or whose smaller arm is too thin, gets a sentence
  // saying so instead of a line that looks confident over data that cannot
  // support one. The caption goes ABOVE its image deliberately — fitBlocks drops
  // from the tail, so a cut can only ever lose the picture and keep the caveat,
  // never the reverse.
  {
    const trends = buildAxisTrends(axisRows, dayKey);
    if (
      trends.charted.length > 0 ||
      trends.counts.length > 0 ||
      trends.skipped.length > 0 ||
      landingStartBlocks.length > 0
    ) {
      blocks.push(section("*The tests*"));
    }
    // Landing → survey leads: it is the only axis that measures what a landing
    // page is FOR, and the one the section was reorganised around.
    blocks.push(...landingStartBlocks);
    blocks.push(...midwayBlocks);
    for (const chart of trends.charted) {
      const series = buildArmSeries(
        rowsForAxis(axisRows, chart.axis).rows,
        chart.arms,
        (r) => r.checkouts
      );
      blocks.push(context(chart.caption));
      if (series.labels.length > 1) {
        const url = await signedChartUrl({
          windowLabel,
          labels: series.labels,
          first: series.first.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
          last: series.last.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
          title: chart.title,
          legendFirst: chart.legendFirst,
          legendLast: chart.legendLast,
          colorFirst: armColor(chart.axis, chart.arms[0]),
          colorLast: armColor(chart.axis, chart.arms[1]),
          headline: chart.headline,
          footnote: chart.footnote,
        });
        if (url) {
          blocks.push({
            type: "image",
            image_url: url,
            alt_text: `${chart.axisTitle}: reached-checkout rate per arm over the reporting window`,
          });
        }
      }
    }
    /**
     * A section, not a context block: these are the numbers for a test that has
     * no chart, so they carry the weight the picture would have. A context block
     * renders them small and italic, which is where a reader's eye goes last.
     */
    for (const young of trends.counts) {
      blocks.push(section(young.text));
    }
    for (const gap of trends.skipped) {
      blocks.push(context(gap.caption));
    }

    /**
     * The email A/B tests, in the same section as the on-site ones.
     *
     * Marcus asked for CVR per EXPERIMENT. Five of ours are emails, and until
     * the arm started riding on the Resend tags they could not appear here at
     * all — `pickEmailVariant` chose a template and forgot. A section that shows
     * the landing test and silently omits five others is the quiet omission this
     * whole exercise exists to remove.
     */
    const emailLines = emailExperiments ? buildEmailExperimentLines(emailExperiments) : [];
    if (emailLines.length > 0) {
      blocks.push(section(`*Email tests — click rate per arm*\n${emailLines.join("\n")}`));
    } else if (emailExperiments && emailExperiments.length === 0) {
      // Counting starts when the tags ship. Saying so is not the same as saying
      // the emails got no clicks.
      blocks.push(
        context(
          "Email A/B results start accumulating from this deploy — before it, the arm an email was sent with was never recorded anywhere."
        )
      );
    }
  }

  // ---- Alerts ----
  const visitorArms = funnel
    ? Object.entries(
        funnel.visitors.reduce<Record<string, number>>((acc, v) => {
          acc[v.arm] = (acc[v.arm] ?? 0) + v.n;
          return acc;
        }, {})
      ).map(([arm, n]) => ({ arm, n }))
    : [];
  const alerts: DigestAlert[] = buildAlerts({
    verdicts,
    visitorArms,
    yesterday,
    baseline,
    pricingCutoverIso: PRICING_CUTOVER_ISO,
    now,
  });
  // Unconditional on purpose. buildAlerts never returns empty — it appends
  // "Nothing crossed a threshold today." — so the heading always has a line
  // under it, and that line is worth printing: it separates "we checked and it
  // is fine" from "the alerting stopped running". A guard here would be dead
  // code implying a case that cannot happen.
  blocks.push(divider());
  blocks.push(
    section(
      `*Alerts*\n${alerts.map((a) => `${a.severity === "warn" ? "⚠️" : "•"} ${escapeSlack(a.message)}`).join("\n")}`
    )
  );

  const paidTotal = steps.length > 0 ? (steps[steps.length - 1]?.count ?? 0) : 0;
  // The fallback text is what lands in the dead-letter table when delivery fails
  // (blocks are NOT dead-lettered), and its first 100 chars are the 60s dedup key,
  // so the day goes early to keep it both standalone and unique per day.
  //
  // When the data could not be read this must NOT say "0 finished, 0 paid" —
  // that is the same falsehood as plotting a missing day as zero, and it is the
  // line that shows up in push notifications and sidebar previews.
  /**
   * Spend sits next to the paid count on purpose.
   *
   * "20 finished, 0 paid yesterday" reads as a slow day. "20 finished, 0 paid, EUR 41.75
   * spent" reads as what it is. Measured 2026-09-14: EUR 1,196 of ads over 30 days
   * returned EUR 129 — an 11% return that nobody had to look at, because the only number
   * posted daily was the free half of the ledger.
   *
   * Omitted entirely when spend is unknown, rather than shown as zero.
   */
  const spentClause = typeof input.adSpend === "number" ? `, ${money(input.adSpend)} spent` : "";
  const text =
    funnel === null
      ? `:chart_with_upwards_trend: Conversion ${dayKey} — data unavailable (could not read the funnel)`
      : `:chart_with_upwards_trend: Conversion ${dayKey} — ${yesterday.completions} finished, ${yesterday.paid} paid${spentClause} yesterday; ${paidTotal} ever paid from ${WINDOW_DAYS} days of finishers`;

  const fitted = fitBlocks(blocks, text);
  return { text, blocks: fitted.blocks, trimmed: fitted.trimmed };
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Staging shares the prod DB, so it must not post or claim.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const trackDuration = startCronTimer("conversion-digest", 60);
  const startMs = Date.now();
  let cronError: string | undefined;

  try {
    const now = new Date();
    /**
     * Berlin, not UTC. GA4 — where the ad spend on this digest comes from — has
     * its property time zone set to Europe/Berlin, so "spend on the 14th" is a
     * Berlin day. The funnel used to count a UTC day and print the two against
     * the same date, which made the cost-per-conversion line a Berlin numerator
     * over a UTC denominator. Measured on the 30 days to 2026-09-14: the
     * totals are identical either way, but 24 of 31 individual days differ, by
     * 1.4 submissions on average against a 13.7/day base.
     *
     * `reportingDayStart` rather than a UTC midnight, because midnight in
     * Berlin is 22:00 or 23:00 UTC depending on the season.
     */
    const dayStart = reportingDayStart(reportingDay(now));
    // One millisecond before today began is yesterday, without assuming a day
    // is 24 hours — on the two changeover days it is 23 or 25.
    const dayKey = reportingDay(new Date(dayStart.getTime() - 1));

    /**
     * Only the SCHEDULED run consumes the day.
     *
     * The claim in `slack_alert_sent` stops two instances both posting, but it
     * also made the first manual run of the day the only one anyone could look
     * at — and Vercel's "Run" button hits the bare path, so it cannot ask for a
     * preview. Anything fired outside the scheduled hour is therefore treated as
     * someone taking a look: no claim, no delivery mark, repeatable. `?preview=1`
     * forces that behaviour even during the scheduled hour.
     *
     * The window is two hours wide to absorb cron drift, so a run that starts a
     * few minutes late still counts as the real one and still claims exactly
     * once. A retry after 11:00 UTC would post again without claiming — a
     * duplicate digest, which is a far smaller problem than not being able to
     * preview the thing at all.
     *
     * Not a hole: the route already requires the CRON_SECRET bearer and refuses
     * to run off the production host, so the only callers are Vercel and whoever
     * holds the secret.
     */
    const SCHEDULED_HOURS_UTC = [9, 10];
    const inScheduledWindow = SCHEDULED_HOURS_UTC.includes(now.getUTCHours());
    const preview = new URL(request.url).searchParams.get("preview") === "1" || !inScheduledWindow;

    if (!preview) {
      const claimed = await tryClaimSlackAlert("conversion_digest", "day", dayKey);
      if (!claimed) {
        return NextResponse.json({ ok: true, day: dayKey, sent: false, reason: "already-claimed" });
      }
    }

    // Snap back to a real Berlin midnight rather than subtracting 30 fixed
    // days, which lands an hour out whenever the window crosses a DST change.
    const windowStart = reportingDayStart(
      reportingDay(new Date(dayStart.getTime() - WINDOW_DAYS * 86_400_000))
    ).toISOString();
    const windowEnd = dayStart.toISOString();
    const [
      funnel,
      cohorts,
      startFunnel,
      axisRows,
      cvrSnap,
      friction,
      midway,
      paywall,
      emailExperiments,
    ] = await Promise.all([
      fetchLandingArmFunnel(windowStart, windowEnd),
      fetchArmCohorts(windowStart, windowEnd),
      fetchLandingStartFunnel(windowStart, windowEnd),
      fetchAxisFunnelDaily(windowStart, windowEnd),
      fetchFunnelCvrSparklines(windowStart, windowEnd),
      buildFrictionReport(windowStart, windowEnd, surveyQuestionNames()),
      fetchMidwayProgress(windowStart, windowEnd, MIDWAY_QUESTION_INDEX),
      fetchPaywallHits(windowStart, windowEnd),
      fetchEmailExperimentResults(windowStart, windowEnd),
    ]);

    /**
     * Ad spend for the day being reported. Best-effort by design: GA4 being unreachable
     * must cost the digest its spend clause, never the digest. `adCovers` is what keeps
     * an uncovered day out — without it a day GA4 has not reported yet reads as EUR 0.00,
     * which is the reassuring falsehood this whole line exists to remove.
     */
    let adSpend: number | null = null;
    try {
      const ad = await adCostByDay();
      adSpend = adCovers(ad, dayKey) ? (ad.byDay.get(dayKey) ?? 0) : null;
    } catch (err) {
      logger.warn({ err, day: dayKey }, "conversion-digest: ad spend unavailable");
    }

    const digest = await buildConversionDigest({
      dayKey,
      funnel,
      cohorts,
      startFunnel,
      midway,
      paywall,
      emailExperiments,
      axisRows,
      cvrDays: cvrSnap?.days ?? null,
      adSpend,
      friction,
      now,
    });
    if (digest.trimmed) {
      logger.warn({ day: dayKey }, "conversion-digest: blocks trimmed to fit Slack");
    }

    await notifySlack({
      channel: "ops",
      // A distinct kind on previews so the 60s text-dedup cannot swallow a repeat
      // send while we iterate on the wording.
      kind: preview
        ? `conversion_digest_preview_${Date.now()}_${(previewSequence += 1)}`
        : "conversion_digest",
      text: digest.text,
      blocks: digest.blocks,
      username: "ops_alerts",
    });
    if (!preview) {
      await markSlackAlertDelivered("conversion_digest", "day", dayKey);
    }

    return NextResponse.json({ ok: true, day: dayKey, sent: true, preview });
  } catch (err) {
    logger.error({ err }, "conversion-digest cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("conversion-digest", startMs, cronError ? "error" : "success", cronError);
  }
}

/** Exported for the AMBIGUOUS bucket assertion in tests. */
export { AMBIGUOUS_VISITOR_ARM };
