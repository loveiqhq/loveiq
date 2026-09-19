/**
 * GET /api/cron/funnel-digest
 *
 * WEEKLY ops digest, Mondays at 08:40 UTC. The daily arm is off — it sent the
 * same nine charts every morning, which is why the whole cron was unscheduled in
 * July, and the scheduled conversion-digest already carries the daily decisions
 * and the per-experiment charts. A CHART-DOMINANT funnel view. The message is a rail of conversion-
 * rate-over-time charts plus a price-bucket chart, a survey drop-out retention
 * curve, and reactivation-email performance — followed by a compact Revenue +
 * Alerts text footer. All the old raw-count charts + verbose text were removed
 * as noise per the strategy lead.
 *
 * Charts are rendered as signed PNG URLs by /api/admin/digest-image/[kind]
 * (edge, next/og). The signed URL carries a deploy-stamp `v` field so each
 * deploy busts Slack's image-proxy cache.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`. Idempotent via
 * slack_alert_sent: daily keyed by UTC day, weekly keyed by ISO week.
 */

import { NextResponse } from "next/server";
import logger from "@shared/observability/logger";
import { notifySlack, escapeSlack, type SlackBlock } from "@shared/observability/slack";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  fitsSlackImageUrl,
  signImagePayload,
  SLACK_IMAGE_URL_MAX,
} from "@shared/url/signed-image-url";
import {
  markSlackAlertDelivered,
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import {
  type DailyMetrics,
  type WeeklyMetrics,
  type FunnelCvrSnapshot,
  type BucketPerfSnapshot,
  type DropoutFunnelSnapshot,
  computeRate,
  delta,
  dayString,
  isoWeekString,
  fetchDailyMetrics,
  fetchWeeklyMetrics,
  fetchFunnelCvrSparklines,
  fetchBucketPerformance,
  fetchDropoutFunnel,
} from "@features/admin/server/digest-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Charts always cover the trailing 30 UTC days — rate trends need history to
// read as a trend. Daily and weekly both post the same 30-day chart rail; only
// the Revenue/Alerts footer cadence (DoD vs WoW) differs.
const CHART_WINDOW_DAYS = 30;
const BUCKET_TOP_N = 5;

type DigestImageKind =
  | "cvr-visitor-start"
  | "cvr-start-completion"
  | "cvr-completion-paygate"
  | "cvr-paygate-purchase"
  | "bucket-performance"
  | "dropout-funnel"
  | "reactivation-email";

// -----------------------------------------------------------------------------
// Shared Slack-text helper (consumed by the tech-digest + product-digest crons)
// -----------------------------------------------------------------------------

const SLACK_TEXT_SOFT_CAP = 2800;

/**
 * Truncate a Slack mrkdwn block to stay under the 3000-char section limit,
 * appending a pointer when clipped. Re-exported here because the sibling
 * tech-digest / product-digest crons import it.
 */
export function clampToSlackLimit(text: string): string {
  if (text.length <= SLACK_TEXT_SOFT_CAP) return text;
  const tail = "\n…_(see /admin for full details — digest truncated)_";
  const cut = SLACK_TEXT_SOFT_CAP - tail.length;
  return text.slice(0, cut) + tail;
}

// -----------------------------------------------------------------------------
// Signed-image-URL plumbing (carried over from prior phases)
// -----------------------------------------------------------------------------

/**
 * Deploy stamp embedded in every signed image URL so a code-only deploy
 * produces fresh URLs and busts Slack's image-proxy cache. Vercel injects
 * VERCEL_GIT_COMMIT_SHA at build time.
 */
function deployStamp(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha && sha.length >= 7) return sha.slice(0, 7);
  return `dev-${process.env.HOSTNAME ?? "local"}`;
}

/**
 * Build an absolute, HMAC-signed image URL the Slack image proxy can fetch.
 * Returns null when NEXT_PUBLIC_SITE_URL is unset or signing throws — the
 * caller then omits that image block.
 */
async function buildSignedImageUrl(
  kind: DigestImageKind,
  payload: Record<string, unknown>
): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) {
    logger.warn({ kind }, "digest-image: NEXT_PUBLIC_SITE_URL unset; skipping image block");
    return null;
  }
  try {
    const { d, s } = await signImagePayload({ kind, v: deployStamp(), ...payload });
    const u = new URL(`/api/admin/digest-image/${kind}`, base);
    u.searchParams.set("d", d);
    u.searchParams.set("s", s);
    const url = u.toString();
    // Over Slack's cap the block is rejected and the WHOLE post fails. Drop the
    // one image instead, loudly enough to be noticed.
    if (!fitsSlackImageUrl(url)) {
      logger.warn(
        { kind, length: url.length, max: SLACK_IMAGE_URL_MAX },
        "digest-image: signed URL over Slack's image_url cap; skipping image block"
      );
      return null;
    }
    return url;
  } catch (err) {
    logger.warn({ err, kind }, "digest-image: sign failed; skipping image block");
    return null;
  }
}

/** Build a line/curve image block, or null when the URL builder fails. */
/**
 * One plain sentence per chart, said before the picture.
 *
 * The weekly message used to be EIGHT bare images in a row with nothing between
 * them, so the only words a reader got were the internal step names burned into
 * each title. The daily message has always captioned its charts; this one did
 * not, and the difference is why it reads as a rail of pictures rather than a
 * report.
 *
 * These say what the chart COUNTS — the population and the action — which is the
 * question a reader has before they have any question about the trend.
 */
const CHART_CAPTIONS: Partial<Record<DigestImageKind, string>> = {
  "cvr-visitor-start":
    "Of everyone who lands on the site, the share who answer the first survey question. A 7-day running average, so one quiet day does not read as a collapse.",
  "cvr-start-completion":
    "Of everyone who answers the first question, the share who reach the last one. A 7-day running average.",
  "cvr-completion-paygate":
    "Of everyone who finishes the survey, the share who reach the point where the report asks for payment. A 7-day running average.",
  "cvr-paygate-purchase":
    "Of everyone who reaches that point, the share who pay. A 7-day running average — on a single day one sale out of one visitor is 100%, which is noise rather than news.",
  "bucket-performance":
    "Each line is one price we showed. The share of people who bought at that price, as a 7-day running average. Both lines share one scale, so their heights compare.",
  "dropout-funnel":
    "Where people quit the survey. Taller means more people left at that point. The last two positions are the contact-details screen and the final opt-in, which is where the steepest drop is — people reach the end and stop at being asked for an email.",
  "reactivation-email":
    "The follow-up emails we send to people who never opened or never bought. How each one performed.",
};

/** The caption for a chart, then the chart. Nothing when there is no chart. */
function withCaption(kind: DigestImageKind, block: SlackBlock | null): SlackBlock[] {
  if (!block) return [];
  const caption = CHART_CAPTIONS[kind];
  return caption
    ? [{ type: "context", elements: [{ type: "mrkdwn", text: caption }] }, block]
    : [block];
}

/**
 * The caption block plus the image, in reading order.
 *
 * Returns an ARRAY because a chart is a caption and a picture, not a picture.
 * An empty array when the URL could not be signed — the caption must never
 * outlive the image it describes, or the message claims a chart it did not send.
 */
async function lineChartBlock(
  kind: DigestImageKind,
  altText: string,
  payload: {
    windowLabel?: string;
    labels: string[];
    series: Array<Array<number | null>>;
    rate?: boolean;
    xAxis?: string[];
  }
): Promise<SlackBlock[]> {
  const url = await buildSignedImageUrl(kind, payload);
  if (!url) return [];
  return withCaption(kind, { type: "image", image_url: url, alt_text: altText });
}

// Pure YYYY-MM-DD -> "MMM D" (no Date/locale -> no tz drift). Used for the
// time-series x-axis tick labels. Exported for unit testing.
const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export function shortDate(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!m) return isoDay;
  const month = MONTH_ABBR[Number(m[2]) - 1] ?? m[2];
  return `${month} ${Number(m[3])}`;
}

// -----------------------------------------------------------------------------
// Chart builders — turn snapshots into signed image blocks via computeRate
// -----------------------------------------------------------------------------

/**
 * Charts 1-5: each funnel-step CVR over time. One image per metric (per the
 * "5 separate charts, own y-scale" decision) so a 5% rate isn't squashed under
 * a 40% one. A chart is omitted when its series is entirely zero (no signal).
 */
async function buildCvrChartBlocks(
  snap: FunnelCvrSnapshot | null,
  windowLabel: string
): Promise<SlackBlock[]> {
  if (!snap || snap.days.length === 0) return [];
  const days = snap.days;
  const out: SlackBlock[] = [];
  // Shared x-axis: one date label per day (e.g. "May 12"). Renderer samples
  // ~5 evenly-spaced ticks from it.
  const xAxis = days.map((d) => shortDate(d.day));

  const single = async (
    kind: DigestImageKind,
    alt: string,
    label: string,
    numKey: keyof (typeof days)[number],
    denKey: keyof (typeof days)[number]
  ) => {
    // Gate on the DENOMINATOR, not the rate: a real 0% conversion (denominator
    // present, numerator always 0 — e.g. paygate→purchase) is critical signal
    // and MUST render. Only skip when the denominator is empty (no traffic at
    // that stage = nothing to convert from).
    const hasDenominator = days.some((d) => Number(d[denKey]) > 0);
    if (!hasDenominator) return;
    const series = trailingRate(
      days.map((d) => Number(d[numKey])),
      days.map((d) => Number(d[denKey]))
    );
    out.push(
      ...(await lineChartBlock(kind, alt, {
        windowLabel,
        labels: [label],
        series: [series],
        rate: true,
        xAxis,
      }))
    );
  };

  await single(
    "cvr-visitor-start",
    "Share of site visitors who answer the first survey question, over time",
    "Of all visitors",
    "starts",
    "visitors"
  );

  /**
   * There was a "Dark journey: visitor to survey-start" chart here. DELETED
   * 2026-08-27 rather than fixed.
   *
   * It drew `visitors_control` from `get_funnel_cvr_sparklines`, a CTE defined as
   * `COALESCE(landing_variant, 'control') <> 'white'` — "everything that is not
   * white", not "the dark arm". Those were the same thing when it was written and
   * stopped being so on 2026-08-21 when round 2 introduced `white_prev`; they were
   * never the same for arm-less traffic. Measured the day it was removed the bucket
   * held 805 arm-less submissions and 34 Landing Page V1 ones against 53 genuinely
   * dark, so the title was ~94% wrong.
   *
   * Deleted rather than repaired because the SCHEDULED conversion-digest already
   * plots the landing axis per real arm through `armLabel`, so a per-arm version of
   * this would only duplicate it. `visitors_control` itself is left in the RPC and
   * in DigestDay — the field is still read by nothing else, and dropping a column
   * from a SECURITY DEFINER function is a migration for no gain; its docstring in
   * digest-metrics.ts records what it actually means.
   */
  await single(
    "cvr-start-completion",
    "Share of people who start the survey and reach the end, over time",
    "Of those who start",
    "completions",
    "starts"
  );

  /**
   * DELETED 2026-09-19: "How soon finishers open their report" (1m / 5m / 10m).
   *
   * Removed at the team's request. Three cumulative lines on one axis read as
   * three competing series rather than one thing measured at three delays, and
   * it was reliably the chart people asked about instead of acting on. The
   * `eng_1m/5m/10m` columns and their RPC are untouched.
   */

  await single(
    "cvr-completion-paygate",
    "Share of survey finishers who reach the point where the report asks for payment, over time",
    "Of those who finish",
    "paygate",
    "completions"
  );
  await single(
    "cvr-paygate-purchase",
    "Share of people at the payment point who buy, over time",
    "Of those who reach it",
    "purchased",
    "paygate"
  );

  return out;
}

/**
 * Chart 6: price-bucket conversion rate over time (one line per bucket, top-N
 * by volume) with a subtitle flagging the bucket that drove the most revenue.
 */
async function buildBucketChartBlock(
  snap: BucketPerfSnapshot | null,
  windowLabel: string
): Promise<SlackBlock[]> {
  if (!snap || snap.days.length === 0) return [];
  const days = snap.days;

  // Aggregate per-bucket totals to rank + to find the top-revenue bucket.
  const totals = new Map<string, { shown: number; purchases: number; revenue: number }>();
  for (const d of days) {
    for (const [bucket, c] of Object.entries(d.buckets)) {
      const t = totals.get(bucket) ?? { shown: 0, purchases: 0, revenue: 0 };
      t.shown += c.shown;
      t.purchases += c.purchases;
      t.revenue += c.revenue;
      totals.set(bucket, t);
    }
  }
  // Keep buckets that actually showed a price (denominator > 0); rank by volume.
  const ranked = [...totals.entries()]
    .filter(([, t]) => t.shown > 0)
    .sort((a, b) => b[1].shown + b[1].purchases - (a[1].shown + a[1].purchases))
    .slice(0, BUCKET_TOP_N);
  if (ranked.length === 0) return [];

  const labels = ranked.map(([bucket]) => bucket.toUpperCase());
  const series = ranked.map(([bucket]) =>
    trailingRate(
      days.map((d) => d.buckets[bucket]?.purchases ?? 0),
      // A day with no rows for this bucket contributes 0 to the denominator,
      // which is correct: nobody was shown that price that day.
      days.map((d) => d.buckets[bucket]?.shown ?? 0)
    )
  );

  // Top bucket by revenue across all buckets (not just ranked) for the subtitle.
  let topRevBucket = "";
  let topRev = 0;
  for (const [bucket, t] of totals) {
    if (t.revenue > topRev) {
      topRev = t.revenue;
      topRevBucket = bucket;
    }
  }
  // No currency symbol: the underlying SUM(payment.amount) can mix currencies
  // (mostly EUR, occasionally MXN). The figure is a cross-bucket ranking signal
  // ("which bucket earns most"), not an exact single-currency total.
  const revNote =
    topRev > 0
      ? `top revenue bucket: ${topRevBucket.toUpperCase()} (~${Math.round(topRev).toLocaleString()})`
      : "no purchases yet";

  return lineChartBlock(
    "bucket-performance",
    "Share of people who bought, at each price we showed, over time",
    {
      windowLabel: `${windowLabel} · ${revNote}`,
      labels,
      series,
      rate: true,
      xAxis: days.map((d) => shortDate(d.day)),
    }
  );
}

/**
 * Chart 7: survey drop-out by question. One bar per question; height = the
 * drop-off RATE at that question = (reached_i - reached_{i+1}) / reached_i.
 * Tall bar = a question where users quit. Renderer highlights the worst few.
 *
 * Reach floor (>=5 distinct sessions) drops tiny-sample late questions whose
 * 1-of-1 bail would otherwise show a misleading 100% bar. The last question
 * has no successor, so it has no drop-off bar (loop stops at length-1).
 */
/**
 * A 7-day TRAILING rate, with gaps where a rate cannot honestly be formed.
 *
 * A raw daily rate on these funnel steps is noise, not a trend. Paygate→purchase
 * averages roughly one purchase a week and a handful of people at the paygate
 * per day, so a day with one of each is 100% — and the chart it produced
 * oscillated between 0% and 100%, set its own y-scale from a single sale, and
 * told the reader nothing except that the numbers are small.
 *
 * Two kinds of gap, and both are `null` rather than 0, because 0% is a
 * measurement and "too few to say" is not:
 *
 *   the first six days  — no full window behind them. Without this the opening
 *                         points are 1-, 2-, ... 6-day rates on a chart whose
 *                         caption promises a 7-day one, and the warm-up
 *                         artefact sets the y-scale for the whole month.
 *   an empty window     — nobody reached the step in those seven days, so there
 *                         is no denominator to divide by.
 *
 * Same rule and same window as `buildArmSeries` in the conversion digest, so
 * the two messages cannot disagree about what a trailing rate means.
 */
const TRAILING_DAYS = 7;
/**
 * Fewer than this many people in the whole 7-day window and there is no rate to
 * report. Matches DROPOUT_REACH_FLOOR, which draws the same line for the same
 * reason.
 *
 * Without it a week in which ONE person was shown a price and bought it reads
 * as 100% — a true statement about one person, drawn at full height, which then
 * sets the shared y-scale and squashes the row beside it (a real 6.7%) into the
 * baseline. A rate is a claim about a population; one person is not one.
 */
const TRAILING_MIN_DENOMINATOR = 5;
function trailingRate(nums: number[], dens: number[]): Array<number | null> {
  return nums.map((_, idx) => {
    if (idx < TRAILING_DAYS - 1) return null;
    let n = 0;
    let d = 0;
    for (let i = idx - (TRAILING_DAYS - 1); i <= idx; i += 1) {
      n += nums[i] ?? 0;
      d += dens[i] ?? 0;
    }
    return d >= TRAILING_MIN_DENOMINATOR ? computeRate(n, d) : null;
  });
}

const DROPOUT_REACH_FLOOR = 5;

export interface DropoutBar {
  label: string;
  dropPct: number;
  reached: number;
}

/**
 * Per-question drop-off bars from an ordered reach array. dropPct at question i
 * = (reached_i - reached_{i+1}) / reached_i. The last question has no successor
 * so it produces no bar. Questions reached by fewer than `floor` distinct
 * sessions are skipped (tiny-sample noise). Exported for unit testing.
 */
export function computeDropoutBars(
  questions: Array<{ question_index: number; sessions: number }>,
  floor = DROPOUT_REACH_FLOOR
): DropoutBar[] {
  const bars: DropoutBar[] = [];
  for (let i = 0; i < questions.length - 1; i += 1) {
    const reached = questions[i]!.sessions;
    const next = questions[i + 1]!.sessions;
    if (reached < floor) continue;
    const dropped = Math.max(0, reached - next);
    bars.push({
      label: `Q${questions[i]!.question_index + 1}`,
      dropPct: computeRate(dropped, reached),
      reached,
    });
  }
  return bars;
}

async function buildDropoutChartBlock(
  snap: DropoutFunnelSnapshot | null,
  windowLabel: string
): Promise<SlackBlock | null> {
  if (!snap || snap.questions.length < 2) return null;
  const bars = computeDropoutBars(snap.questions);
  if (bars.length === 0) return null;
  // Compact payload (label + integer %) so ~59 bars stay under Slack's
  // ~3000-char image_url cap. `reached` is dropped (renderer doesn't use it).
  const compact = bars.map((b) => ({ label: b.label, dropPct: Math.round(b.dropPct) }));
  const url = await buildSignedImageUrl("dropout-funnel", { windowLabel, bars: compact });
  if (!url) return null;
  return {
    type: "image",
    image_url: url,
    alt_text: "Where people quit the survey — the share who left on each question",
  };
}

/**
 * DELETED 2026-09-19: "Survey drop-off by question — email-first vs email-last".
 *
 * It charted the `survey-email-position-ab` experiment, which was RETIRED on
 * 2026-08-16. `email_position` has not been written since: all 1,055
 * `survey_partial_save` rows carry NULL, the oldest from 2026-08-20. The chart
 * could only ever draw two empty curves under a title naming a live test.
 *
 * Removed rather than repaired — there is nothing to repair. This is the
 * axis-level retirement idiom the repo already uses: the arm labels stay in
 * labels.ts so stored rows read truthfully, and the chart that claimed a running
 * comparison goes. The `get_dropout_funnel_by_arm` RPC and the `first`/`last`
 * fetchers are left alone; dropping a SECURITY DEFINER function is a migration
 * for no gain, and its comment already records the retirement.
 */

/**
 * DELETED 2026-09-19: "Reactivation email performance".
 *
 * Removed at the team's request while trimming the weekly message to the charts
 * people act on. Its `purchased` half was never trustworthy anyway — checkout
 * does not stamp `payment.metadata.promoStage`, so that column read 0 whatever
 * the emails did, which is a documented gap rather than a result.
 *
 * `fetchNurturePerformance` and `get_nurture_performance` stay: the data is
 * correct and worth having when someone looks at the sequence deliberately.
 * This removes the weekly picture, not the source.
 */

// -----------------------------------------------------------------------------
// Revenue + Alerts text footer (the only text we keep)
// -----------------------------------------------------------------------------

const PLAN_ORDER: Array<keyof DailyMetrics["revenue"]["planMix"]> = [
  "essentials",
  "full_report",
  "core",
  "all_reports",
];

function formatCurrency(byCurrency: Record<string, number>): string {
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return "—";
  return entries.map(([cur, amount]) => `${cur} ${amount.toFixed(2)}`).join(" + ");
}

function formatPlanMix(planMix: DailyMetrics["revenue"]["planMix"]): string {
  return PLAN_ORDER.map((p) => `${p} ${planMix[p]}`).join(" / ");
}

/**
 * Compact Revenue section. `cadence` is "DoD" (daily) or "WoW" (weekly) — only
 * affects the delta label. Always emitted (revenue is core signal).
 */
export function formatRevenueLines(
  curr: DailyMetrics,
  prev: DailyMetrics,
  cadence: "DoD" | "WoW"
): string[] {
  const r = curr.revenue;
  return [
    "*Revenue*",
    `• Purchases: ${r.count} — ${formatCurrency(r.byCurrency)} (${cadence}: ${delta(r.count, prev.revenue.count)})`,
    `• Plan mix: ${formatPlanMix(r.planMix)}`,
    `• Refunds: ${curr.refunds} (${curr.refundAmount.toFixed(2)}) | Failed: ${curr.failedPayments} | Disputes: ${curr.disputes} | Promo: ${r.promoRedemptions}`,
  ];
}

/**
 * Alerts section: risk + watch breaches from the anomaly snapshot, capped at 5.
 * Empty array when no breaches.
 */
export function formatAlertLines(curr: DailyMetrics): string[] {
  const snap = curr.anomalies;
  if (!snap || snap.items.length === 0) return [];
  const breaches = snap.items.filter((i) => i.severity === "risk" || i.severity === "watch");
  if (breaches.length === 0) return [];
  const lines: string[] = ["*Alerts*"];
  for (const item of breaches.slice(0, 5)) {
    const emoji = item.severity === "risk" ? ":rotating_light:" : ":warning:";
    lines.push(`${emoji} ${escapeSlack(item.title)}: ${escapeSlack(item.detail)}`);
  }
  if (breaches.length > 5) {
    lines.push(`• …and ${breaches.length - 5} more (see /admin/anomalies)`);
  }
  return lines;
}

// -----------------------------------------------------------------------------
// Digest composition
// -----------------------------------------------------------------------------

export interface FunnelDigestResult {
  blocks: SlackBlock[];
  text: string;
}

/**
 * Compose the full chart-dominant digest: header + 8 chart images + Revenue +
 * Alerts footer. Returns Block Kit blocks + a plain-text fallback for the Slack
 * notification preview. Each chart is independently gated; missing data simply
 * drops that one image.
 */
export async function buildFunnelDigestBlocks(opts: {
  title: string;
  windowLabel: string;
  cvr: FunnelCvrSnapshot | null;
  bucket: BucketPerfSnapshot | null;
  dropout: DropoutFunnelSnapshot | null;
  curr: DailyMetrics;
  prev: DailyMetrics;
  cadence: "DoD" | "WoW";
}): Promise<FunnelDigestResult> {
  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: opts.title, emoji: true } },
    { type: "context", elements: [{ type: "mrkdwn", text: opts.windowLabel }] },
  ];

  // Charts 1-5 (CVR funnel steps), 6 (bucket), 7 (drop-out), 8 (reactivation).
  for (const b of await buildCvrChartBlocks(opts.cvr, opts.windowLabel)) blocks.push(b);
  blocks.push(...(await buildBucketChartBlock(opts.bucket, opts.windowLabel)));
  blocks.push(
    ...withCaption("dropout-funnel", await buildDropoutChartBlock(opts.dropout, opts.windowLabel))
  );

  // Text footer: Revenue (always) + Alerts (when breaches exist).
  const footerLines = [
    ...formatRevenueLines(opts.curr, opts.prev, opts.cadence),
    "",
    ...formatAlertLines(opts.curr),
  ];
  const footerText = footerLines.join("\n").trim();
  if (footerText) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: footerText } });
  }

  // Notification-preview fallback text.
  const text = `${opts.title} — Purchases ${opts.curr.revenue.count}, ${formatCurrency(opts.curr.revenue.byCurrency)}`;
  return { blocks, text };
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

/** Fetch the 4 chart snapshots for the trailing 30-day window. */
async function fetchChartSnapshots(untilIso: string) {
  const sinceIso = new Date(
    new Date(untilIso).getTime() - CHART_WINDOW_DAYS * 86_400_000
  ).toISOString();
  const [cvr, bucket, dropout] = await Promise.all([
    fetchFunnelCvrSparklines(sinceIso, untilIso),
    fetchBucketPerformance(sinceIso, untilIso),
    fetchDropoutFunnel(sinceIso, untilIso),
  ]);
  return { cvr, bucket, dropout };
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Skip on the staging Vercel project (shares the prod DB).
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const trackDuration = startCronTimer("funnel-digest", 60);
  const startMs = Date.now();
  let cronError: string | undefined;

  try {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayStart = new Date(dayStart.getTime() - 86_400_000);
    const dayBeforeStart = new Date(yesterdayStart.getTime() - 86_400_000);
    const dayKey = dayString(yesterdayStart);

    let dailySent = false;
    let weeklySent = false;

    /**
     * ---- Daily: WEEKLY ONLY, deliberately ----
     *
     * This digest was unscheduled on 2026-07-26 "per the strategy lead" for being
     * a rail of pictures with no decision attached, and the daily and weekly
     * messages post the SAME 30-day chart rail — only the revenue cadence differs
     * (DoD vs WoW). Re-enabling it daily would put a second nine-chart message in
     * #ops every morning, beside `conversion-digest`, which already leads with a
     * decision and carries the per-experiment charts Marcus asked for. Two of the
     * charts would be the same metric twice.
     *
     * So it comes back weekly, where a broad picture earns its place and cannot
     * become wallpaper. The daily branch stays in the code, gated, rather than
     * deleted: the weekly path reuses every builder it calls, and flipping this
     * constant is how you would turn it back on.
     */
    const DAILY_ENABLED = false;
    const dailyClaimed = DAILY_ENABLED && (await tryClaimSlackAlert("daily_digest", "day", dayKey));
    if (dailyClaimed) {
      const yesterdayIso = yesterdayStart.toISOString();
      const [curr, prev, snaps] = await Promise.all([
        fetchDailyMetrics(yesterdayIso, dayStart.toISOString()),
        fetchDailyMetrics(dayBeforeStart.toISOString(), yesterdayIso),
        fetchChartSnapshots(dayStart.toISOString()),
      ]);
      const digest = await buildFunnelDigestBlocks({
        title: `📊 Funnel — ${dayKey} UTC`,
        windowLabel: `${CHART_WINDOW_DAYS}-day trends ending ${dayKey} UTC`,
        cvr: snaps.cvr,
        bucket: snaps.bucket,
        dropout: snaps.dropout,
        curr,
        prev,
        cadence: "DoD",
      });
      await notifySlack({
        channel: "ops",
        kind: "daily_digest",
        text: digest.text,
        blocks: digest.blocks,
        username: "ops_alerts",
      });
      await markSlackAlertDelivered("daily_digest", "day", dayKey);
      dailySent = true;
    }

    // ---- Weekly recap (Mondays UTC) ----
    if (now.getUTCDay() === 1) {
      const weekKey = isoWeekString(yesterdayStart);
      const weeklyClaimed = await tryClaimSlackAlert("weekly_digest", "week", weekKey);
      if (weeklyClaimed) {
        const weekStart = new Date(dayStart.getTime() - 7 * 86_400_000);
        const prevWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);
        const weekStartIso = weekStart.toISOString();
        const [currW, prevW, snaps] = await Promise.all([
          fetchWeeklyMetrics(weekStartIso, dayStart.toISOString()),
          fetchWeeklyMetrics(prevWeekStart.toISOString(), weekStartIso),
          fetchChartSnapshots(dayStart.toISOString()),
        ]);
        const digest = await buildFunnelDigestBlocks({
          title: `📈 Weekly funnel — ${weekKey}`,
          windowLabel: `${CHART_WINDOW_DAYS}-day trends ending ${dayKey} UTC`,
          cvr: snaps.cvr,
          bucket: snaps.bucket,
          dropout: snaps.dropout,
          curr: currW,
          prev: prevW,
          cadence: "WoW",
        });
        await notifySlack({
          channel: "ops",
          kind: "weekly_digest",
          text: digest.text,
          blocks: digest.blocks,
          username: "ops_alerts",
        });
        await markSlackAlertDelivered("weekly_digest", "week", weekKey);
        weeklySent = true;
      }
    }

    return NextResponse.json({ ok: true, day: dayKey, dailySent, weeklySent });
  } catch (err) {
    logger.error({ err }, "funnel-digest cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("funnel-digest", startMs, cronError ? "error" : "success", cronError);
  }
}
