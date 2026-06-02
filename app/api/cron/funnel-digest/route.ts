/**
 * GET /api/cron/funnel-digest
 *
 * Daily ops digest at 09:00 UTC (and a weekly recap on Mondays). Phase 3
 * refocus: a CHART-DOMINANT funnel view. The message is a rail of conversion-
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
import { signImagePayload } from "@shared/url/signed-image-url";
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
  type NurturePerfSnapshot,
  computeRate,
  delta,
  dayString,
  isoWeekString,
  fetchDailyMetrics,
  fetchWeeklyMetrics,
  fetchFunnelCvrSparklines,
  fetchBucketPerformance,
  fetchDropoutFunnel,
  fetchNurturePerformance,
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
  | "cvr-completion-engagement"
  | "cvr-completion-paygate"
  | "cvr-paygate-purchase"
  | "bucket-performance"
  | "dropout-funnel"
  | "reactivation-email";

// Human labels for the reactivation-email nurture stages.
const NURTURE_STAGE_LABELS: Record<string, string> = {
  "6h_no_view": "6h · no view",
  "6h_no_unlock": "6h · no unlock",
  "30h_no_unlock": "30h · 50% off",
  "54h_no_unlock": "54h · 75% off",
  "78h_no_unlock": "78h · call invite",
};

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
    return u.toString();
  } catch (err) {
    logger.warn({ err, kind }, "digest-image: sign failed; skipping image block");
    return null;
  }
}

/** Build a line/curve image block, or null when the URL builder fails. */
async function lineChartBlock(
  kind: DigestImageKind,
  altText: string,
  payload: {
    windowLabel?: string;
    labels: string[];
    series: number[][];
    rate?: boolean;
    xAxis?: string[];
  }
): Promise<SlackBlock | null> {
  const url = await buildSignedImageUrl(kind, payload);
  if (!url) return null;
  return { type: "image", image_url: url, alt_text: altText };
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
    const series = days.map((d) => computeRate(Number(d[numKey]), Number(d[denKey])));
    const block = await lineChartBlock(kind, alt, {
      windowLabel,
      labels: [label],
      series: [series],
      rate: true,
      xAxis,
    });
    if (block) out.push(block);
  };

  await single(
    "cvr-visitor-start",
    "Visitor to survey-start conversion rate over time",
    "Visitor → Start",
    "starts",
    "visitors"
  );
  await single(
    "cvr-start-completion",
    "Survey-start to completion conversion rate over time",
    "Start → Completion",
    "completions",
    "starts"
  );

  // Chart 3 — completion -> report-view at 1m / 5m / 10m (3 lines, one chart).
  // Gate on the denominator (completions), so a real 0% engagement still shows.
  if (days.some((d) => d.completions > 0)) {
    const eng1 = days.map((d) => computeRate(d.eng_1m, d.completions));
    const eng5 = days.map((d) => computeRate(d.eng_5m, d.completions));
    const eng10 = days.map((d) => computeRate(d.eng_10m, d.completions));
    const block = await lineChartBlock(
      "cvr-completion-engagement",
      "Completion to report-view conversion (1m / 5m / 10m) over time",
      {
        windowLabel,
        labels: ["1 min", "5 min", "10 min"],
        series: [eng1, eng5, eng10],
        rate: true,
        xAxis,
      }
    );
    if (block) out.push(block);
  }

  await single(
    "cvr-completion-paygate",
    "Completion to paygate conversion rate over time",
    "Completion → Paygate",
    "paygate",
    "completions"
  );
  await single(
    "cvr-paygate-purchase",
    "Paygate to purchase conversion rate over time",
    "Paygate → Purchase",
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
): Promise<SlackBlock | null> {
  if (!snap || snap.days.length === 0) return null;
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
  if (ranked.length === 0) return null;

  const labels = ranked.map(([bucket]) => bucket.toUpperCase());
  const series = ranked.map(([bucket]) =>
    days.map((d) => {
      const c = d.buckets[bucket];
      return c ? computeRate(c.purchases, c.shown) : 0;
    })
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

  return lineChartBlock("bucket-performance", "Price-bucket conversion rate over time", {
    windowLabel: `${windowLabel} · ${revNote}`,
    labels,
    series,
    rate: true,
    xAxis: days.map((d) => shortDate(d.day)),
  });
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
    alt_text: "Survey drop-off rate per question — where users quit",
  };
}

/**
 * Chart 8: reactivation-email performance — per nurture stage sent + purchased
 * with CVR%. purchased may read 0 until checkout stamps payment.metadata.
 * promoStage (documented gap); the chart still shows send volume.
 */
async function buildReactivationChartBlock(
  snap: NurturePerfSnapshot | null,
  windowLabel: string
): Promise<SlackBlock | null> {
  if (!snap || snap.stages.length === 0) return null;
  const stages = snap.stages
    .filter((s) => s.sent > 0 || s.purchased > 0)
    .map((s) => ({
      label: NURTURE_STAGE_LABELS[s.stage] ?? s.stage,
      sent: s.sent,
      purchased: s.purchased,
    }));
  if (stages.length === 0) return null;
  const url = await buildSignedImageUrl("reactivation-email", { windowLabel, stages });
  if (!url) return null;
  return {
    type: "image",
    image_url: url,
    alt_text: "Reactivation email performance per nurture stage",
  };
}

// -----------------------------------------------------------------------------
// Revenue + Alerts text footer (the only text we keep)
// -----------------------------------------------------------------------------

const PLAN_ORDER: Array<keyof DailyMetrics["revenue"]["planMix"]> = [
  "essentials",
  "full_report",
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
  nurture: NurturePerfSnapshot | null;
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
  const bucketBlock = await buildBucketChartBlock(opts.bucket, opts.windowLabel);
  if (bucketBlock) blocks.push(bucketBlock);
  const dropoutBlock = await buildDropoutChartBlock(opts.dropout, opts.windowLabel);
  if (dropoutBlock) blocks.push(dropoutBlock);
  const reactivationBlock = await buildReactivationChartBlock(opts.nurture, opts.windowLabel);
  if (reactivationBlock) blocks.push(reactivationBlock);

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
  const [cvr, bucket, dropout, nurture] = await Promise.all([
    fetchFunnelCvrSparklines(sinceIso, untilIso),
    fetchBucketPerformance(sinceIso, untilIso),
    fetchDropoutFunnel(sinceIso, untilIso),
    fetchNurturePerformance(sinceIso, untilIso),
  ]);
  return { cvr, bucket, dropout, nurture };
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

    // ---- Daily (single message) ----
    const dailyClaimed = await tryClaimSlackAlert("daily_digest", "day", dayKey);
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
        nurture: snaps.nurture,
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
          nurture: snaps.nurture,
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
