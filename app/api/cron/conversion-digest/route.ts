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
import { signImagePayload } from "@shared/url/signed-image-url";
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
import { computeRate, dayString } from "@features/admin/server/digest-metrics";
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
  TINY_ARM,
  sumDays,
  sumVisitors,
} from "@features/admin/server/conversion-digest";
import { armLabel, type ExperimentAxis } from "@features/attribution/server/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Trends need history to read as trends; matches funnel-digest's window. */
const WINDOW_DAYS = 30;

/**
 * The axes worth a verdict. `paywall` is deliberately absent — that experiment
 * concluded in favour of the forced paywall and nothing randomises it any more,
 * so presenting it as a live test is exactly the mistake the /admin dashboard
 * made before it was corrected.
 */
const VERDICT_AXES: ExperimentAxis[] = ["landing", "survey", "pricing"];

/**
 * When report prices last changed. Pre- and post-change arm A are different
 * products, so the digest says the pricing comparison restarts rather than
 * pooling two prices into one rate. Update this on the next price change.
 */
const PRICING_CUTOVER_ISO = "2026-08-24T02:46:49Z";

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
async function signedChartUrl(payload: Record<string, unknown>): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) {
    logger.warn("conversion-digest: NEXT_PUBLIC_SITE_URL unset; skipping chart");
    return null;
  }
  try {
    const { d, s } = await signImagePayload({
      kind: "conversion-by-arm",
      v: deployStamp(),
      ...payload,
    });
    const u = new URL("/api/admin/digest-image/conversion-by-arm", base);
    u.searchParams.set("d", d);
    u.searchParams.set("s", s);
    return u.toString();
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
 * Generic in the numerator and in the row type, because the same shape draws
 * four charts now: completion→paid for the landing arms, and completion→checkout
 * for each of the three live experiment axes. One builder means the trailing
 * window and the null-gap rule below cannot drift between them.
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
 * Visits -> survey-started per day, per arm, as a 7-day trailing rate.
 *
 * `null` for any day the arm had no visits, so an arm that had not launched is a
 * GAP rather than a plotted zero. Trailing rather than daily because a handful of
 * starts on a low-traffic day swings a daily rate wildly.
 */
export function buildStartSeries(
  funnel: LandingStartFunnel,
  arms: [string, string]
): { labels: string[]; first: Array<number | null>; last: Array<number | null> } {
  const days = Array.from(new Set(funnel.daily.map((r) => r.day))).sort();
  const dayIndex = new Map(days.map((day, i) => [day, i]));
  const rateFor = (arm: string): Array<number | null> =>
    days.map((_, idx) => {
      const from = Math.max(0, idx - 6);
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
  /** Per-day, per-arm rows for every live axis. [] when the RPC is unavailable. */
  axisRows?: AxisFunnelRow[];
  now: Date;
}

export interface BuiltDigest {
  text: string;
  blocks: SlackBlock[];
  trimmed: boolean;
}

export async function buildConversionDigest(input: DigestInput): Promise<BuiltDigest> {
  const { dayKey, funnel, cohorts, now } = input;
  const startFunnel = input.startFunnel ?? null;
  const axisRows = input.axisRows ?? [];
  const windowLabel = `${WINDOW_DAYS}-day window ending ${dayKey} UTC`;

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
  blocks.push(
    context(
      `${windowLabel} · "visits" are visitor-days on any page, not people · the verdicts below compare arms on finished surveys → ever paid, counted server-side with no consent gap · the reached-survey chart is NOT arm-comparable yet (see its caption)`
    )
  );

  // ---- The decision, first ----
  if (verdicts.length > 0) {
    blocks.push(
      section(`*Where the tests stand*\n${verdicts.map((v) => `• ${v.sentence}`).join("\n")}`)
    );
  } else {
    // `cohorts === null` means the read FAILED; an empty array means there is
    // genuinely nothing. Saying "no experiment data" for a failed read tells the
    // reader the experiments are dead.
    blocks.push(
      section(
        cohorts === null
          ? "*Where the tests stand*\n• Could not read the experiment data — this is a measurement failure, not a result."
          : "*Where the tests stand*\n• No experiment data in this window."
      )
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
    blocks.push(section("*Yesterday, against the usual day*"));
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
    steps = buildFunnel(funnel.cohort, totalVisits);
    // Skip the visits -> finished step. It is the largest drop by construction
    // (most visitors never start a survey) and would be the headline every single
    // day, which is how a digest becomes wallpaper. The full funnel is printed
    // right below, so nothing is hidden — only the HEADLINE moves to a step
    // someone can act on.
    const leak = biggestLeak(steps.slice(1));
    blocks.push(divider());
    blocks.push(
      section(
        `*The funnel — ${WINDOW_DAYS} days*${
          leak
            ? `\nBiggest drop: ${escapeSlack(shortStep(leak.from))} → ${escapeSlack(shortStep(leak.to))}, losing ${leak.pct}%`
            : ""
        }`
      )
    );
    const rows = steps.map((s) => {
      const drop = s.dropFromPrev > 0 ? `  ▼ ${s.dropFromPrev}%` : "";
      return `\`${String(s.count).padStart(6)}\`  ${String(s.pctOfTop).padStart(5)}%  ${escapeSlack(s.step)}${drop}`;
    });
    blocks.push(section(rows.join("\n")));
  }

  // ---- Visits → reached the survey. NOT arm-comparable yet. ----
  //
  // The intent is right: a landing page decides whether a visitor starts a survey,
  // which finished→paid (below) cannot measure. The INSTRUMENTATION is not there
  // yet, and an audit found three reasons the two arms are not measuring the same
  // thing. Until they are fixed this is a trend line for the site, not a verdict
  // on a landing page, and it is titled and captioned to say so.
  //
  //  1. The numerator is a different funnel step per arm. `survey_engine_mount`
  //     fires when the survey ENGINE mounts. The current landing page has an inline
  //     first question (white/WQuestionCard.tsx) whose answer is written to the
  //     survey's localStorage, and SurveyPage.loadInitialStep() then skips
  //     straight to the engine ("If localStorage has answers, skip to engine").
  //     The previous landing page has no such component, so its visitors reach the
  //     engine only after four wizard slides and a consent screen. Same event
  //     name, different step — worth roughly a third in relative terms at
  //     plausible survival rates, from instrumentation alone.
  //  2. The denominator is every public page, not the landing page. shouldCountVisit
  //     excludes only /api, /admin, /_next and /login, so /glossary/*,
  //     /report/<token> and the legal pages all count — credited to whatever arm
  //     the visitor's year-old cookie holds. A report buyer re-reading their
  //     report adds visit-days and can never add a start, so the better-
  //     converting arm is PENALISED. That runs opposite to (1), so the gap is
  //     uninterpretable in either direction rather than merely noisy.
  //  3. The numerator is consent-gated and the denominator is not.
  //     SurveyEngine only pings when __liq_vid exists, and proxy.ts mints that
  //     cookie only under hasAnalyticsConsent. The visit row is written
  //     server-side with a throwaway id and no consent check.
  //
  // The fix is one arm-symmetric, path-scoped, server-side event pair; it needs
  // RSC-navigation detection in middleware, because both landing pages link to
  // /survey with next/link and that is not a document request.
  if (startFunnel) {
    const liveArms = ["white", "white_prev"] as const;
    const series = buildStartSeries(startFunnel, [liveArms[0], liveArms[1]]);
    const totalFor = (arm: string) => startFunnel.totals.find((t) => t.arm === arm);
    const summary = (arm: string) => {
      const label = armLabel("landing", arm).short;
      const row = totalFor(arm);
      if (!row || row.visits === 0) return `${label} no visits recorded yet`;
      return `${label} ${row.starts}/${row.visits} started`;
    };
    const hasAny = series.first.some((v) => v != null) || series.last.some((v) => v != null);
    if (hasAny && series.labels.length > 1) {
      const url = await signedChartUrl({
        windowLabel,
        labels: series.labels,
        first: series.first.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
        last: series.last.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
        title: "Site visit-days → reached the survey questions",
        legendFirst: armLabel("landing", liveArms[0]).short,
        legendLast: armLabel("landing", liveArms[1]).short,
        headline: `NOT comparable between arms yet — see caption  ·  ${summary(liveArms[0])}  ·  ${summary(liveArms[1])}`,
        // Honest about the two id spaces: the denominator is server-side and uses
        // a throwaway id per visit, the numerator is client-side and keyed on the
        // durable visitor cookie. So this is starts per visit-day, not a
        // per-person rate — and per-arm recording only began 2026-08-25, so
        // earlier days are absent rather than zero.
        footnote:
          "reached-survey ÷ ALL-PAGE visit-days, 7-day trailing · the arms are NOT measuring the same step: the current landing page's inline question skips its visitors straight to the survey engine · the denominator counts every page, so re-reading a report penalises the arm that sold it · the numerator needs analytics consent, the denominator does not · per-arm recording began 25 Aug · peak {peak}%",
      });
      if (url) {
        blocks.push({
          type: "image",
          image_url: url,
          alt_text:
            "Site visit-days to reached-survey rate, by landing page arm. Not comparable between arms yet — the two arms measure different funnel steps.",
        });
      }
    }
  } else {
    blocks.push(
      context(
        "_Visits → survey-started by landing page is not available yet — its migration has not been applied._"
      )
    );
  }

  // ---- Finished survey → paid. Downstream of the landing page. ----
  if (funnel) {
    const liveArms = ["white", "white_prev"] as const;
    const series = buildArmSeries(funnel.daily, [liveArms[0], liveArms[1]], (r) => r.paid);

    // An arm with no sales yet plots as a flat line along the bottom, and a flat
    // line against a real curve reads as "this landing page converts at nothing" when
    // the truth is "13 people, far too few to say". Hiding the chart until both
    // arms have a sale would cost weeks of the other arm's trend, so the sample
    // sizes go in the HEADLINE instead and the flat line explains itself.
    const cohortFor = (arm: string) => funnel.cohort.find((c) => c.arm === arm);
    const armSummary = (arm: string) => {
      const label = armLabel("landing", arm).short;
      const row = cohortFor(arm);
      if (!row || row.completions === 0) return `${label} no finishers yet`;
      return `${label} ${row.paid}/${row.completions} paid`;
    };
    const smallest = Math.min(
      cohortFor(liveArms[0])?.completions ?? 0,
      cohortFor(liveArms[1])?.completions ?? 0
    );
    const headline =
      `${armSummary(liveArms[0])}  ·  ${armSummary(liveArms[1])}` +
      (smallest < TINY_ARM ? "  —  too early to compare" : "");

    // Chart whenever EITHER arm has something to show; the headline above carries
    // the caveat when one of them is effectively empty.
    const hasAnySignal =
      series.first.some((v) => v != null && v > 0) || series.last.some((v) => v != null && v > 0);
    if (hasAnySignal && series.labels.length > 1) {
      const url = await signedChartUrl({
        windowLabel,
        labels: series.labels,
        // null survives to the renderer as a genuine gap in the line.
        first: series.first.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
        last: series.last.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
        title: "Purchases per finished survey, by landing page",
        legendFirst: armLabel("landing", liveArms[0]).short,
        legendLast: armLabel("landing", liveArms[1]).short,
        headline,
        footnote:
          // NOT "% of finishers who paid": numerator and denominator are both
          // counted on the day they happened, so the payers are not drawn from
          // that window's finishers. Nurture mail runs to 78h and post-call
          // coupons last 14 days, so a real share of any week's sales come from
          // earlier weeks' finishers — and the most recent days are depressed
          // because their finishers have not had time to buy yet.
          "purchases ÷ finished surveys, both counted on the day they happened — not a cohort rate; recent days read low · 7-day trailing · shared y-scale (peak {peak}%)",
      });
      if (url) {
        blocks.push({
          type: "image",
          image_url: url,
          alt_text: "Conversion rate by landing page arm over the last 30 days",
        });
      }
    }
  }

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
    if (trends.charted.length > 0 || trends.skipped.length > 0) {
      blocks.push(section("*How each A/B test is performing*"));
    }
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
    for (const gap of trends.skipped) {
      blocks.push(context(gap.caption));
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
  const text =
    funnel === null
      ? `:chart_with_upwards_trend: Conversion ${dayKey} — data unavailable (could not read the funnel)`
      : `:chart_with_upwards_trend: Conversion ${dayKey} — ${yesterday.completions} finished, ${yesterday.paid} paid yesterday; ${paidTotal} ever paid from ${WINDOW_DAYS} days of finishers`;

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
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayStart = new Date(dayStart.getTime() - 86_400_000);
    const dayKey = dayString(yesterdayStart);

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

    const windowStart = new Date(dayStart.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
    const windowEnd = dayStart.toISOString();
    const [funnel, cohorts, startFunnel, axisRows] = await Promise.all([
      fetchLandingArmFunnel(windowStart, windowEnd),
      fetchArmCohorts(windowStart, windowEnd),
      fetchLandingStartFunnel(windowStart, windowEnd),
      fetchAxisFunnelDaily(windowStart, windowEnd),
    ]);

    const digest = await buildConversionDigest({
      dayKey,
      funnel,
      cohorts,
      startFunnel,
      axisRows,
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
