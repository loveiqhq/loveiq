/**
 * GET /api/cron/funnel-digest
 *
 * Daily ops digest at 09:00 UTC. Covers yesterday's metrics across
 * acquisition / activation / revenue / engagement / email health,
 * plus top-3 archetypes and UTM sources. Every metric carries a
 * day-over-day delta.
 *
 * On Mondays a SECOND Slack message follows the daily — a comprehensive
 * 7-day weekly digest with WoW deltas, 5-stage conversion funnel,
 * worst-rated chapters, top issue categories, and survey drop-off
 * questions.
 *
 * All metric fetchers live in features/admin/server/digest-metrics.ts
 * so this cron and the on-demand /api/admin/digest route share one
 * query path.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`. Idempotent via
 * slack_alert_sent: daily keyed by UTC day, weekly keyed by ISO week.
 */

import { NextResponse } from "next/server";
import logger from "@shared/observability/logger";
import { notifySlack, escapeSlack, type SlackBlock } from "@shared/observability/slack";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { signImagePayload } from "@shared/url/signed-image-url";
import type { LeakSeverity } from "@features/admin/server/digest-leak-scoring";
import type { Recommendation } from "@features/admin/server/digest-recommendations";
import type { RevisitedEntry } from "@features/admin/server/digest-recommendation-compare";
import { persistRecommendations } from "@features/admin/server/digest-recommendation-history";
import {
  markSlackAlertDelivered,
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import {
  type AnswerLiftSnapshot,
  type DailyMetrics,
  type DropoffEverywhereSnapshot,
  type EngagementLiftSnapshot,
  type SparklineSnapshot,
  type WeeklyMetrics,
  type WizardSlideRetentionSnapshot,
  delta,
  dayString,
  fetchDailyMetrics,
  fetchFunnelCaptureStart,
  fetchWeeklyMetrics,
  isoWeekString,
} from "@features/admin/server/digest-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// -----------------------------------------------------------------------------
// Formatters
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

function formatTopList(list: Array<[string, number]>, fallback = "—"): string {
  if (list.length === 0) return fallback;
  return list.map(([name, n]) => `${name} (${n})`).join(", ");
}

function metricWithDelta(label: string, curr: number, prev: number, unit = ""): string {
  return `• ${label}: ${curr}${unit} (DoD: ${delta(curr, prev)})`;
}

/**
 * Same as metricWithDelta but appends "X.XX% of starts" — the share of the
 * day's survey starts this metric represents. Used for funnel-stage metrics
 * (activation, purchases) so a reader can see at a glance how much of the
 * starting cohort reached each step. Skipped automatically when starts = 0.
 */
function metricWithDeltaAndStartsPct(
  label: string,
  curr: number,
  prev: number,
  surveyStarts: number,
  unit = ""
): string {
  if (surveyStarts <= 0) {
    return metricWithDelta(label, curr, prev, unit);
  }
  const pct = ((curr / surveyStarts) * 100).toFixed(2);
  return `• ${label}: ${curr}${unit} (DoD: ${delta(curr, prev)}, ${pct}% of starts)`;
}

// -----------------------------------------------------------------------------
// Daily message
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Strategy-lead helpers
// -----------------------------------------------------------------------------

/**
 * Slack text blocks hard-cap at 3000 chars. Existing digest is ~1500; the
 * strategy-lead sections add another ~800–1500. To avoid a silent truncation
 * by Slack, guard at 2800 chars and append a fallback pointer. Pure
 * formatting — never throws.
 */
const SLACK_TEXT_SOFT_CAP = 2800;

export function clampToSlackLimit(text: string): string {
  if (text.length <= SLACK_TEXT_SOFT_CAP) return text;
  const tail = "\n…_(see /admin for full details — digest truncated)_";
  const cut = SLACK_TEXT_SOFT_CAP - tail.length;
  return text.slice(0, cut) + tail;
}

/**
 * Picks the metric with the largest absolute DoD% change as the "today's story"
 * headline. Filters out low-base movers (prev < 5) so the prelaunch digest
 * doesn't lead with "+∞%" or "(low base)" noise. Returns null when nothing
 * qualifies — the renderer then omits the headline line entirely.
 */
const HEADLINE_THRESHOLD_PCT = 25;
const HEADLINE_MIN_PREV = 5;

interface HeadlineCandidate {
  label: string;
  curr: number;
  prev: number;
}

/**
 * When `funnel_event` capture started after the digest window opened, the
 * visitor + Saw-Q1 numbers for that window are partial-day and should not
 * drive the digest narrative. This signal flows through formatDaily/formatWeekly
 * so renderers can footnote them and `pickHeadline` can skip them as
 * candidates.
 */
export interface PartialCapture {
  capturedFromIso: string;
  windowStartIso: string;
}

function partialCaptureNote(p: PartialCapture): string {
  // Format the capture-start as HH:MM UTC on its own day. The window start is
  // already in the digest title so we only show the time delta here.
  const t = new Date(p.capturedFromIso);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  const day = p.capturedFromIso.slice(0, 10);
  return `:warning: _Visitor capture started ${day} ${hh}:${mm} UTC — Unique visitors / Saw Q1 below reflect a partial window. Full-day metric resumes in the next digest._`;
}

export function pickHeadline(
  curr: DailyMetrics,
  prev: DailyMetrics,
  partial?: PartialCapture | null
): string | null {
  const candidates: HeadlineCandidate[] = [
    // Visitor + engine_mount counts are funnel_event-derived. When capture is
    // partial-day they would understate truth and headline-by-them would mislead.
    ...(partial
      ? []
      : ([
          { label: "Unique visitors", curr: curr.uniqueVisitors, prev: prev.uniqueVisitors },
          { label: "Saw Q1", curr: curr.surveyEngineMounts, prev: prev.surveyEngineMounts },
        ] as HeadlineCandidate[])),
    { label: "Survey starts", curr: curr.surveyStarts, prev: prev.surveyStarts },
    { label: "Completions", curr: curr.completions, prev: prev.completions },
    { label: "Completion rate", curr: curr.completionRate, prev: prev.completionRate },
    { label: "Begin checkouts", curr: curr.beginCheckouts, prev: prev.beginCheckouts },
    { label: "Purchases", curr: curr.revenue.count, prev: prev.revenue.count },
  ];
  let winner: { candidate: HeadlineCandidate; pct: number } | null = null;
  for (const c of candidates) {
    if (c.prev < HEADLINE_MIN_PREV) continue;
    const pct = Math.round(((c.curr - c.prev) / c.prev) * 100);
    if (Math.abs(pct) < HEADLINE_THRESHOLD_PCT) continue;
    if (!winner || Math.abs(pct) > Math.abs(winner.pct)) {
      winner = { candidate: c, pct };
    }
  }
  if (!winner) return null;
  const arrow = winner.pct > 0 ? "▲" : "▼";
  const sign = winner.pct > 0 ? "+" : "";
  return `:fire: *Today's story:* ${winner.candidate.label} ${arrow} ${sign}${winner.pct}% (${winner.candidate.curr} vs ${winner.candidate.prev})`;
}

/**
 * Renders the top-5 UTM sources as a per-source funnel. Cap depth: 5 rows.
 * Returns an empty array when the snapshot is null/empty so the renderer
 * can skip the whole section header.
 */
export function formatChannelLines(curr: DailyMetrics): string[] {
  const snap = curr.channels;
  if (!snap || snap.channels.length === 0) return [];
  const rows = snap.channels.slice(0, 5);
  const lines: string[] = ["*Channels (top 5)*"];
  for (const ch of rows) {
    const revenueStr = ch.revenueTotal > 0 ? ` | revenue ${ch.revenueTotal.toFixed(2)}` : "";
    // escapeSlack on `source` — UTM source values are user-controllable via
    // ?utm_source=... and could otherwise break mrkdwn formatting.
    lines.push(
      `• ${escapeSlack(ch.source)}: ${ch.starts} starts → ${ch.completionRate.toFixed(0)}% complete → ${ch.paidRate.toFixed(1)}% paid${revenueStr} (${ch.action}, ${ch.confidence} conf)`
    );
  }
  if (snap.summary.bestSource) {
    lines.push(`• :star: best: ${escapeSlack(snap.summary.bestSource)}`);
  }
  return lines;
}

/**
 * One-block "biggest leak today" callout. Uses the highest-priority leak from
 * `priorities`, falling back to the dimension snapshot's strongest leak.
 */
export function formatLeakLines(curr: DailyMetrics): string[] {
  const snap = curr.leak;
  if (!snap || snap.priorities.length === 0) return [];
  const top = snap.priorities[0]!;
  const extras = snap.priorities.slice(1, 3);
  const lines: string[] = ["*Today's biggest leak*"];
  // escapeSlack on `label` / `explanation` — labels are derived from UTM
  // values and free-text explanations, both attacker-controllable.
  lines.push(
    `• ${escapeSlack(top.label)}: ${escapeSlack(top.leakStageLabel)} — ${top.leakCount} dropped (${top.leakRate.toFixed(1)}% rate, ${top.confidence} conf)`
  );
  if (top.explanation) lines.push(`  ${escapeSlack(top.explanation)}`);
  for (const item of extras) {
    lines.push(
      `• also: ${escapeSlack(item.label)} ${escapeSlack(item.leakStageLabel)} — ${item.leakCount} dropped (${item.leakRate.toFixed(1)}%)`
    );
  }
  return lines;
}

/**
 * "*Alerts*" section: risk + watch findings from the anomaly snapshot. Capped
 * at 5 to avoid bloating the Slack message. Skipped entirely when no breaches.
 */
export function formatAlertLines(curr: DailyMetrics): string[] {
  const snap = curr.anomalies;
  if (!snap || snap.items.length === 0) return [];
  const breaches = snap.items.filter((i) => i.severity === "risk" || i.severity === "watch");
  if (breaches.length === 0) return [];
  const lines: string[] = ["*Alerts*"];
  for (const item of breaches.slice(0, 5)) {
    const emoji = item.severity === "risk" ? ":rotating_light:" : ":warning:";
    // escapeSlack on title/detail — admin-set labels can contain mrkdwn chars
    // and a few items derive from UTM-source values.
    lines.push(`${emoji} ${escapeSlack(item.title)}: ${escapeSlack(item.detail)}`);
  }
  if (breaches.length > 5) {
    lines.push(`• …and ${breaches.length - 5} more (see /admin/anomalies)`);
  }
  return lines;
}

/**
 * Per-archetype revenue + paywall→purchase velocity. Top 3 archetypes by
 * revenue. Median time-to-purchase comes from a separate fetcher.
 */
export function formatMonetizationLines(curr: DailyMetrics): string[] {
  const snap = curr.monetization;
  if (!snap || snap.archetypes.length === 0) return [];
  const ranked = [...snap.archetypes]
    .sort((a, b) => b.revenueTotal - a.revenueTotal)
    .slice(0, 3)
    .filter((a) => a.starts > 0);
  if (ranked.length === 0) return [];
  const lines: string[] = ["*Segment monetization*"];
  for (const a of ranked) {
    // Archetype names come from scoring config (admin-controlled, not user
    // input) but escape defensively in case a name ever contains mrkdwn chars.
    lines.push(
      `• ${escapeSlack(a.archetype)}: ${a.starts} starts | revenue ${a.revenueTotal.toFixed(2)} (per-start ${a.revenuePerStart.toFixed(2)}) | monetize ${a.monetizationRate.toFixed(1)}%`
    );
  }
  if (curr.medianTimeToPurchaseHours != null) {
    lines.push(`• Median paywall → purchase: ${curr.medianTimeToPurchaseHours}h`);
  }
  return lines;
}

/**
 * PreReportWizard slide-by-slide retention. Each line shows the absolute
 * count + share of the previous slide. Skipped when fewer than ~3 submissions
 * reached slide 1 — the funnel is too small to tell a story.
 */
export function formatWizardFunnel(snap: WizardSlideRetentionSnapshot | null): string[] {
  if (!snap) return [];
  if (snap.slide1 < 3) return [];
  const lines: string[] = ["*Wizard funnel*"];
  const kept = (curr: number, prev: number): string =>
    prev > 0 ? `${Math.round((curr / prev) * 100)}% kept` : "—";
  lines.push(`• Slide 1 entered: ${snap.slide1}`);
  lines.push(`• Slide 2:        ${snap.slide2} (${kept(snap.slide2, snap.slide1)})`);
  lines.push(`• Slide 3:        ${snap.slide3} (${kept(snap.slide3, snap.slide2)})`);
  lines.push(`• Slide 4:        ${snap.slide4} (${kept(snap.slide4, snap.slide3)})`);
  lines.push(`• Slide 5:        ${snap.slide5} (${kept(snap.slide5, snap.slide4)})`);
  lines.push(`• Report viewed:  ${snap.reportViewed} (${kept(snap.reportViewed, snap.slide5)})`);
  return lines;
}

/**
 * Compact 30-day trends as Unicode block sparklines. One char per UTC day,
 * scaled so the max value in the window maps to `█` and zero maps to `▁`.
 * Returns empty array when the snapshot is null OR every metric is zero
 * across the entire window (no story to tell).
 */
const SPARKLINE_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function buildSparkline(values: number[]): { line: string; max: number } {
  if (values.length === 0) return { line: "", max: 0 };
  const max = values.reduce((a, b) => Math.max(a, b), 0);
  if (max <= 0) return { line: SPARKLINE_CHARS[0]!.repeat(values.length), max: 0 };
  const last = SPARKLINE_CHARS.length - 1;
  const chars = values.map((v) => {
    const ratio = Math.max(0, Math.min(1, v / max));
    const idx = Math.min(last, Math.max(0, Math.round(ratio * last)));
    return SPARKLINE_CHARS[idx]!;
  });
  return { line: chars.join(""), max };
}

export function formatSparklines(snap: SparklineSnapshot | null): string[] {
  if (!snap || snap.days.length === 0) return [];
  const cols = [
    { label: "Visitors     ", key: "visitors" as const },
    { label: "Survey starts", key: "starts" as const },
    { label: "Completions  ", key: "completions" as const },
    { label: "Report views ", key: "report_views" as const },
    { label: "Paywall init ", key: "paywall_init" as const },
    { label: "Purchases    ", key: "purchases" as const },
  ];
  // Suppress section entirely if EVERY metric is zero across EVERY day —
  // common in cold-start staging.
  const anyNonZero = cols.some((c) => snap.days.some((d) => d[c.key] > 0));
  if (!anyNonZero) return [];
  const lines: string[] = [`*${snap.days.length}-day trends* (oldest → newest)`];
  for (const col of cols) {
    const series = snap.days.map((d) => d[col.key]);
    const { line, max } = buildSparkline(series);
    lines.push(`• ${col.label} \`${line}\` (peak ${max})`);
  }
  return lines;
}

/**
 * Comprehensive funnel drop-off — every edge from unique visitors to purchase.
 * Walks the ordered stage list once, prints stage-kept % vs the previous stage,
 * tags the single largest absolute drop with `← biggest leak`.
 */
const STAGE_LABELS: Record<string, string> = {
  unique_visitors: "Unique visitors",
  saw_q1: "Saw Q1",
  survey_started: "Survey started",
  q1_answered: "Q1 answered",
  completed_all_questions: "Last question answered",
  survey_submitted: "Survey submitted",
  wizard_slide_1: "Wizard slide 1",
  wizard_slide_5: "Wizard slide 5",
  report_viewed: "Report viewed",
  engagement_1min: "Engagement 1m+",
  engagement_5min: "Engagement 5m+",
  engagement_10min: "Engagement 10m+",
  paywall_initiated: "Paywall initiated",
  begin_checkout: "Begin checkout",
  purchased: "Purchased",
};

export function formatDropoffEverywhere(snap: DropoffEverywhereSnapshot | null): string[] {
  if (!snap || snap.stages.length === 0) return [];
  if (snap.stages[0]!.count === 0) return [];
  // Compute per-stage drop = max(0, prev - curr). The first stage has no drop.
  const rows: Array<{ label: string; count: number; drop: number; rate: number }> = [];
  let prevCount = snap.stages[0]!.count;
  rows.push({
    label: STAGE_LABELS[snap.stages[0]!.name] ?? snap.stages[0]!.name,
    count: prevCount,
    drop: 0,
    rate: 0,
  });
  for (let i = 1; i < snap.stages.length; i += 1) {
    const stage = snap.stages[i]!;
    const drop = Math.max(0, prevCount - stage.count);
    const rate = prevCount > 0 ? (drop / prevCount) * 100 : 0;
    rows.push({
      label: STAGE_LABELS[stage.name] ?? stage.name,
      count: stage.count,
      drop,
      rate,
    });
    prevCount = stage.count;
  }
  // Identify biggest leak by absolute drop count among non-first rows.
  let leakIdx = -1;
  let leakDrop = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i]!;
    if (r.drop > leakDrop) {
      leakDrop = r.drop;
      leakIdx = i;
    }
  }
  const lines: string[] = ["*Drop-off everywhere (weekly)*"];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!;
    const arrow = i === 0 ? " " : "→";
    const dropSuffix = i === 0 ? "" : ` — ${r.drop} dropped (${r.rate.toFixed(0)}%)`;
    const leakTag = i === leakIdx && leakDrop > 0 ? " ← biggest leak" : "";
    lines.push(`• ${arrow} ${r.label}: ${r.count}${dropSuffix}${leakTag}`);
  }
  return lines;
}

/**
 * Top 5 (question, answer-option) cohorts whose purchase rate diverges most
 * from the survey-wide baseline. Each line is a single sentence so the strategy
 * lead can scan it in 5 seconds. Question + answer text run through escapeSlack
 * because both are admin-controlled strings (CSV-sourced) that could contain
 * Slack mrkdwn characters.
 */
const ANSWER_LIFT_QTEXT_MAX = 60;
const ANSWER_LIFT_ANSWER_MAX = 40;

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function formatAnswerLift(snap: AnswerLiftSnapshot | null): string[] {
  if (!snap || snap.pairs.length === 0) return [];
  if (snap.baseline_n === 0 || snap.baseline_paid === 0) return [];
  const lines: string[] = [
    `*Answer → conversion lift (weekly, baseline = ${snap.baseline_pct.toFixed(1)}%, n=${snap.baseline_n})*`,
  ];
  for (const p of snap.pairs) {
    const qText = truncate(p.q_text || p.q_id, ANSWER_LIFT_QTEXT_MAX);
    const answer = truncate(p.answer, ANSWER_LIFT_ANSWER_MAX);
    const sign = p.lift_pct > 0 ? "+" : "";
    const antiTag = p.lift_pct < 0 ? " ← anti-signal" : "";
    lines.push(
      `• ${escapeSlack(p.q_id)} "${escapeSlack(qText)}" = "${escapeSlack(answer)}" → ${p.rate_pct.toFixed(1)}% paid (n=${p.n}, ${sign}${p.lift_pct}%)${antiTag}`
    );
  }
  return lines;
}

/**
 * Engagement-bucket purchase rate. Always orders 0-1m → 10m+ so the trend is
 * visually obvious. Tags the highest-paid-rate bucket with a multiple-of-baseline
 * suffix when it's at least 2× the lowest non-zero bucket — that's where the
 * strategy lead sees the revenue lever.
 */
const BUCKET_ORDER: Array<EngagementLiftSnapshot["buckets"][number]["bucket"]> = [
  "0-1m",
  "1-5m",
  "5-10m",
  "10m+",
];

export function formatEngagementLift(snap: EngagementLiftSnapshot | null): string[] {
  if (!snap || snap.buckets.length === 0) return [];
  const byBucket = new Map(snap.buckets.map((b) => [b.bucket, b]));
  const totalN = snap.buckets.reduce((a, b) => a + b.n, 0);
  if (totalN === 0) return [];
  // Find baseline-ish reference rate = aggregate-paid / aggregate-n
  const totalPaid = snap.buckets.reduce((a, b) => a + b.paid, 0);
  const baselineRate = totalN > 0 ? totalPaid / totalN : 0;
  // Highest-rate bucket — for the "Nx baseline" tag.
  let topBucket: EngagementLiftSnapshot["buckets"][number] | null = null;
  for (const b of snap.buckets) {
    const rate = b.n > 0 ? b.paid / b.n : 0;
    const topRate = topBucket && topBucket.n > 0 ? topBucket.paid / topBucket.n : 0;
    if (!topBucket || rate > topRate) topBucket = b;
  }
  const lines: string[] = ["*Engagement → purchase (weekly)*"];
  for (const key of BUCKET_ORDER) {
    const b = byBucket.get(key);
    if (!b) continue;
    const rate = b.n > 0 ? (b.paid / b.n) * 100 : 0;
    const isTop = topBucket && topBucket.bucket === b.bucket && b.n > 0;
    let tag = "";
    if (isTop && baselineRate > 0) {
      const mult = baselineRate > 0 ? rate / 100 / baselineRate : 0;
      if (mult >= 2) tag = ` ← ${mult.toFixed(1)}× baseline`;
    }
    lines.push(`• ${b.bucket} dwell: n=${b.n}, paid ${rate.toFixed(1)}% (${b.paid})${tag}`);
  }
  return lines;
}

// -----------------------------------------------------------------------------

// Exported (in addition to GET below) so unit tests can lock the message
// format without having to mock the full Supabase + Slack pipeline.
export function formatDaily(
  dayKey: string,
  curr: DailyMetrics,
  prev: DailyMetrics,
  partial?: PartialCapture | null
): string {
  const lines = [`:bar_chart: *Daily digest — ${dayKey} UTC*`, ""];

  // Partial-day-capture warning sits at the top so the reader sees the caveat
  // before any visitor-derived number. Only emitted when funnel_event began
  // capturing AFTER this window opened (typically the day a new metric ships).
  if (partial) {
    lines.push(partialCaptureNote(partial));
    lines.push("");
  }

  // Headline of the day — prepended after the title when a metric crosses the
  // delta threshold. Skipped when nothing qualifies (prelaunch low-base case).
  const headline = pickHeadline(curr, prev, partial);
  if (headline) {
    lines.push(headline);
    lines.push("");
  }

  const starts = curr.surveyStarts;

  // Survey starts is the funnel baseline (the denominator for "% of starts"),
  // so we don't annotate it with its own percentage — every other funnel-stage
  // metric shows its share of this number instead.
  //
  // Unique visitors + "Saw Q1" sit above Survey starts because they're earlier
  // funnel stages. "Saw Q1" is annotated with its share of UNIQUE VISITORS
  // (not of survey starts) — visitor → Q1 is the top-of-funnel conversion.
  lines.push("*Acquisition*");
  lines.push(metricWithDelta("Unique visitors", curr.uniqueVisitors, prev.uniqueVisitors));
  // New-vs-returning split. Returning % is over today's total visitors so it's
  // a single shared denominator; omitted when total is 0.
  if (curr.uniqueVisitors > 0) {
    const returningPct = ((curr.returningVisitors / curr.uniqueVisitors) * 100).toFixed(1);
    lines.push(
      `• New: ${curr.newVisitors} (DoD: ${delta(curr.newVisitors, prev.newVisitors)}) | Returning: ${curr.returningVisitors} (${returningPct}% of visitors)`
    );
  }
  const sawQ1Pct =
    curr.uniqueVisitors > 0
      ? `, ${((curr.surveyEngineMounts / curr.uniqueVisitors) * 100).toFixed(2)}% of visitors`
      : "";
  lines.push(
    `• Saw Q1: ${curr.surveyEngineMounts} (DoD: ${delta(curr.surveyEngineMounts, prev.surveyEngineMounts)}${sawQ1Pct})`
  );
  lines.push(metricWithDelta("Survey starts", starts, prev.surveyStarts));
  lines.push(
    `• Completions: ${curr.completions} (${curr.completionRate}% rate, DoD: ${delta(curr.completionRate, prev.completionRate)})`
  );
  lines.push("");

  // Channels — top-5 UTM sources with per-source funnel. Section is OMITTED
  // entirely when the snapshot is null (builder failed) or empty.
  const channelLines = formatChannelLines(curr);
  if (channelLines.length > 0) {
    lines.push(...channelLines);
    lines.push("");
  }

  lines.push("*Activation*");
  lines.push(
    metricWithDeltaAndStartsPct("Report viewers", curr.reportViewers, prev.reportViewers, starts)
  );
  lines.push(
    metricWithDeltaAndStartsPct("Engagement 1m+", curr.engagement1min, prev.engagement1min, starts)
  );
  lines.push(
    metricWithDeltaAndStartsPct("Engagement 5m+", curr.engagement5min, prev.engagement5min, starts)
  );
  lines.push(
    metricWithDeltaAndStartsPct(
      "Engagement 10m+",
      curr.engagement10min,
      prev.engagement10min,
      starts
    )
  );
  lines.push(
    metricWithDeltaAndStartsPct(
      "Paywall initiated (user-click)",
      curr.paywallInitiated,
      prev.paywallInitiated,
      starts
    )
  );
  lines.push(
    metricWithDeltaAndStartsPct("Begin checkouts", curr.beginCheckouts, prev.beginCheckouts, starts)
  );
  lines.push("");

  // Wizard funnel — slide-by-slide retention through PreReportWizard.
  // Sits between Activation and the leak callout because it IS the activation
  // bridge from survey-completed to report-viewed. Omitted when the snapshot
  // is null (RPC failed) or when slide 1 saw fewer than 3 entries.
  const wizardLines = formatWizardFunnel(curr.wizardFunnel);
  if (wizardLines.length > 0) {
    lines.push(...wizardLines);
    lines.push("");
  }

  // Today's biggest leak — drop-off analysis. Skipped when snapshot is null.
  const leakLines = formatLeakLines(curr);
  if (leakLines.length > 0) {
    lines.push(...leakLines);
    lines.push("");
  }

  lines.push("*Revenue*");
  const purchasesPct =
    starts > 0 ? `, ${((curr.revenue.count / starts) * 100).toFixed(2)}% of starts` : "";
  lines.push(
    `• Purchases: ${curr.revenue.count} — ${formatCurrency(curr.revenue.byCurrency)} (DoD: ${delta(curr.revenue.count, prev.revenue.count)}${purchasesPct})`
  );
  lines.push(`• Plan mix: ${formatPlanMix(curr.revenue.planMix)}`);
  lines.push(
    `• Refunds: ${curr.refunds} (${curr.refundAmount.toFixed(2)}) | Failed: ${curr.failedPayments} | Disputes: ${curr.disputes}`
  );
  lines.push(
    metricWithDelta(
      "Promo redemptions",
      curr.revenue.promoRedemptions,
      prev.revenue.promoRedemptions
    )
  );
  lines.push("");

  // Segment monetization — per-archetype revenue + paywall→purchase velocity.
  const monetizationLines = formatMonetizationLines(curr);
  if (monetizationLines.length > 0) {
    lines.push(...monetizationLines);
    lines.push("");
  }

  // Alerts — risk/watch findings from anomaly snapshot. Omitted when no breaches.
  const alertLines = formatAlertLines(curr);
  if (alertLines.length > 0) {
    lines.push(...alertLines);
    lines.push("");
  }

  lines.push("*Engagement*");
  lines.push(`• Invites sent: ${curr.invites} | Shares: ${curr.shares}`);
  lines.push(`• Chapter feedback: ${curr.thumbsUp} :thumbsup: / ${curr.thumbsDown} :thumbsdown:`);
  lines.push("");

  lines.push("*Email health*");
  lines.push(
    `• Bounces: ${curr.bounces} | Complaints: ${curr.complaints} | Unsubscribes: ${curr.unsubscribes}`
  );
  lines.push(
    `• Opens: ${curr.emailOpened} (DoD: ${delta(curr.emailOpened, prev.emailOpened)}) | Clicks: ${curr.emailClicked} (DoD: ${delta(curr.emailClicked, prev.emailClicked)})`
  );
  lines.push("");

  lines.push("*Top breakdowns*");
  lines.push(`• Archetypes: ${formatTopList(curr.topArchetypes)}`);
  lines.push(`• Sources: ${formatTopList(curr.topUtmSources)}`);
  if (curr.topCompletionHours.length > 0) {
    const hoursStr = curr.topCompletionHours
      .map((h) => `${String(h.hour).padStart(2, "0")}:00 (${h.count})`)
      .join(", ");
    lines.push(`• Top hours (UTC): ${hoursStr}`);
  }

  // 30-day longitudinal sparklines — text-only Unicode block-char trend lines.
  // Always last so they don't push the funnel-stage numbers below the fold.
  const sparkLines = formatSparklines(curr.sparklines);
  if (sparkLines.length > 0) {
    lines.push("");
    lines.push(...sparkLines);
  }

  return clampToSlackLimit(lines.join("\n"));
}

// -----------------------------------------------------------------------------
// Weekly message
// -----------------------------------------------------------------------------

function metricWithWow(label: string, curr: number, prev: number, unit = ""): string {
  return `• ${label}: ${curr}${unit} (WoW: ${delta(curr, prev)})`;
}

/** Same as metricWithWow but appends "X.XX% of starts" for funnel-stage metrics. */
function metricWithWowAndStartsPct(
  label: string,
  curr: number,
  prev: number,
  surveyStarts: number,
  unit = ""
): string {
  if (surveyStarts <= 0) {
    return metricWithWow(label, curr, prev, unit);
  }
  const pct = ((curr / surveyStarts) * 100).toFixed(2);
  return `• ${label}: ${curr}${unit} (WoW: ${delta(curr, prev)}, ${pct}% of starts)`;
}

export function formatWeekly(
  weekKey: string,
  weekRangeLabel: string,
  curr: WeeklyMetrics,
  prev: WeeklyMetrics,
  partial?: PartialCapture | null
): string {
  const lines = [`:chart_with_upwards_trend: *Weekly digest — ${weekKey} (${weekRangeLabel})*`, ""];

  // Same partial-capture warning as the daily — applies when funnel_event
  // capture started during this week's window.
  if (partial) {
    lines.push(partialCaptureNote(partial));
    lines.push("");
  }

  // Headline reuses the daily picker — WoW deltas are still meaningful when
  // a single metric moves > 25% week-over-week.
  const headline = pickHeadline(curr, prev, partial);
  if (headline) {
    lines.push(headline);
    lines.push("");
  }

  const wStarts = curr.surveyStarts;

  // Survey starts is the funnel baseline — same convention as the daily.
  // Unique visitors + Saw Q1 lead the section (top-of-funnel stages).
  lines.push("*Acquisition*");
  lines.push(metricWithWow("Unique visitors", curr.uniqueVisitors, prev.uniqueVisitors));
  if (curr.uniqueVisitors > 0) {
    const returningPct = ((curr.returningVisitors / curr.uniqueVisitors) * 100).toFixed(1);
    lines.push(
      `• New: ${curr.newVisitors} (WoW: ${delta(curr.newVisitors, prev.newVisitors)}) | Returning: ${curr.returningVisitors} (${returningPct}% of visitors)`
    );
  }
  const wSawQ1Pct =
    curr.uniqueVisitors > 0
      ? `, ${((curr.surveyEngineMounts / curr.uniqueVisitors) * 100).toFixed(2)}% of visitors`
      : "";
  lines.push(
    `• Saw Q1: ${curr.surveyEngineMounts} (WoW: ${delta(curr.surveyEngineMounts, prev.surveyEngineMounts)}${wSawQ1Pct})`
  );
  lines.push(metricWithWow("Survey starts", wStarts, prev.surveyStarts));
  lines.push(
    `• Completions: ${curr.completions} (${curr.completionRate}% rate, WoW: ${delta(curr.completionRate, prev.completionRate)})`
  );
  lines.push(`• Avg completion time: ${curr.avgCompletionSec}s`);
  lines.push("");

  // Channels — same shape as daily; window is the 7-day weekly span.
  const channelLines = formatChannelLines(curr);
  if (channelLines.length > 0) {
    lines.push(...channelLines);
    lines.push("");
  }

  lines.push("*Activation*");
  lines.push(
    metricWithWowAndStartsPct("Report viewers", curr.reportViewers, prev.reportViewers, wStarts)
  );
  lines.push(
    metricWithWowAndStartsPct("Engagement 1m+", curr.engagement1min, prev.engagement1min, wStarts)
  );
  lines.push(
    metricWithWowAndStartsPct("Engagement 5m+", curr.engagement5min, prev.engagement5min, wStarts)
  );
  lines.push(
    metricWithWowAndStartsPct(
      "Engagement 10m+",
      curr.engagement10min,
      prev.engagement10min,
      wStarts
    )
  );
  lines.push(
    metricWithWowAndStartsPct(
      "Paywall initiated (user-click)",
      curr.paywallInitiated,
      prev.paywallInitiated,
      wStarts
    )
  );
  lines.push(
    metricWithWowAndStartsPct("Begin checkouts", curr.beginCheckouts, prev.beginCheckouts, wStarts)
  );
  lines.push("");

  // Weekly biggest leak — same renderer as daily.
  const leakLines = formatLeakLines(curr);
  if (leakLines.length > 0) {
    lines.push(...leakLines);
    lines.push("");
  }

  lines.push("*Revenue*");
  const wPurchasesPct =
    wStarts > 0 ? `, ${((curr.revenue.count / wStarts) * 100).toFixed(2)}% of starts` : "";
  lines.push(
    `• Purchases: ${curr.revenue.count} — ${formatCurrency(curr.revenue.byCurrency)} (WoW: ${delta(curr.revenue.count, prev.revenue.count)}${wPurchasesPct})`
  );
  lines.push(`• Plan mix: ${formatPlanMix(curr.revenue.planMix)}`);
  lines.push(
    `• Refunds: ${curr.refunds} (${curr.refundAmount.toFixed(2)}) | Failed: ${curr.failedPayments} | Disputes: ${curr.disputes}`
  );
  lines.push(
    metricWithWow("Promo redemptions", curr.revenue.promoRedemptions, prev.revenue.promoRedemptions)
  );
  lines.push("");

  // Segment monetization — per-archetype revenue + paywall→purchase velocity.
  const monetizationLines = formatMonetizationLines(curr);
  if (monetizationLines.length > 0) {
    lines.push(...monetizationLines);
    lines.push("");
  }

  // Alerts — risk/watch breaches over the week.
  const alertLines = formatAlertLines(curr);
  if (alertLines.length > 0) {
    lines.push(...alertLines);
    lines.push("");
  }

  lines.push("*Engagement*");
  lines.push(metricWithWow("Invites sent", curr.invites, prev.invites));
  lines.push(metricWithWow("Shares created", curr.shares, prev.shares));
  lines.push(`• Chapter feedback: ${curr.thumbsUp} :thumbsup: / ${curr.thumbsDown} :thumbsdown:`);
  lines.push("");

  lines.push("*Email health*");
  lines.push(
    `• Bounces: ${curr.bounces} | Complaints: ${curr.complaints} | Unsubscribes: ${curr.unsubscribes}`
  );
  lines.push(
    `• Opens: ${curr.emailOpened} (WoW: ${delta(curr.emailOpened, prev.emailOpened)}) | Clicks: ${curr.emailClicked} (WoW: ${delta(curr.emailClicked, prev.emailClicked)})`
  );
  lines.push("");

  // Conversion funnel — each line shows % kept from the previous stage AND
  // % of Survey starts (the funnel baseline) so it's clear at a glance what
  // share of the original cohort reached each step. Unique visitors + Saw Q1
  // lead the funnel; "Survey starts" remains the baseline for "% of starts".
  const f = curr.funnel;
  const stageKept = (curr: number, prev: number): string =>
    prev > 0 ? `${Math.round((curr / prev) * 100)}% kept` : "—";
  const ofStarts = (curr: number): string =>
    f.starts > 0 ? `${((curr / f.starts) * 100).toFixed(2)}% of starts` : "—";
  lines.push("*Conversion funnel*");
  lines.push(`• Unique visitors: ${f.uniqueVisitors}`);
  lines.push(
    `• Saw Q1: ${f.engineMounts} (${stageKept(f.engineMounts, f.uniqueVisitors)}, ${ofStarts(f.engineMounts)})`
  );
  lines.push(
    `• Survey starts: ${f.starts} (${stageKept(f.starts, f.engineMounts)}, ${ofStarts(f.starts)})`
  );
  lines.push(
    `• Completions: ${f.completions} (${stageKept(f.completions, f.starts)}, ${ofStarts(f.completions)})`
  );
  lines.push(
    `• Report viewed: ${f.reportViewed} (${stageKept(f.reportViewed, f.completions)}, ${ofStarts(f.reportViewed)})`
  );
  lines.push(
    `• Paywall initiated: ${f.paywallInitiated} (${stageKept(f.paywallInitiated, f.reportViewed)}, ${ofStarts(f.paywallInitiated)})`
  );
  lines.push(
    `• Purchased: ${f.purchased} (${stageKept(f.purchased, f.paywallInitiated)}, ${ofStarts(f.purchased)})`
  );
  const overallPct =
    f.uniqueVisitors > 0 ? `${((f.purchased / f.uniqueVisitors) * 100).toFixed(2)}%` : "—";
  lines.push(`• Overall conversion: ${overallPct} (visitors → purchased)`);
  lines.push("");

  lines.push("*Top breakdowns*");
  lines.push(`• Archetypes: ${formatTopList(curr.topArchetypes)}`);
  lines.push(`• Sources: ${formatTopList(curr.topUtmSources)}`);
  if (curr.topCompletionHours.length > 0) {
    const hoursStr = curr.topCompletionHours
      .map((h) => `${String(h.hour).padStart(2, "0")}:00 (${h.count})`)
      .join(", ");
    lines.push(`• Top hours (UTC): ${hoursStr}`);
  }
  lines.push("");

  // Quality signals
  if (curr.dropOff.length || curr.worstChapters.length || curr.topIssues.length) {
    lines.push("*Quality signals*");
    if (curr.dropOff.length) {
      const dropList = curr.dropOff
        .map((d) => `Q${d.questionIndex} (${d.abandonCount})`)
        .join(", ");
      lines.push(`• Top survey drop-offs: ${dropList}`);
    }
    if (curr.worstChapters.length) {
      const chList = curr.worstChapters
        .map((c) => `${c.sectionId} (${c.downs} :thumbsdown:)`)
        .join(", ");
      lines.push(`• Worst-rated chapters: ${chList}`);
    }
    if (curr.topIssues.length) {
      const issueList = curr.topIssues.map((i) => `${i.issue} (${i.count})`).join(", ");
      lines.push(`• Top feedback issues: ${issueList}`);
    }
  }

  return clampToSlackLimit(lines.join("\n"));
}

// -----------------------------------------------------------------------------
// Block Kit — signed image URLs + visual message builders (Phase 2)
// -----------------------------------------------------------------------------

/**
 * Build an absolute, HMAC-signed image URL that the Slack image proxy can
 * fetch. The base URL must be set via NEXT_PUBLIC_SITE_URL in production —
 * Slack's bot cannot reach localhost or relative paths.
 *
 * Returns null when:
 *  - NEXT_PUBLIC_SITE_URL is unset (logs warn — the digest still ships
 *    with text only, no images)
 *  - signing throws (e.g. signing secret missing)
 */
async function buildSignedImageUrl(
  kind: "funnel" | "wizard" | "sparklines" | "engagement" | "leaks",
  payload: Record<string, unknown>
): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) {
    logger.warn({ kind }, "digest-image: NEXT_PUBLIC_SITE_URL unset; skipping image block");
    return null;
  }
  try {
    const { d, s } = await signImagePayload({ kind, ...payload });
    const u = new URL(`/api/admin/digest-image/${kind}`, base);
    u.searchParams.set("d", d);
    u.searchParams.set("s", s);
    return u.toString();
  } catch (err) {
    logger.warn({ err, kind }, "digest-image: sign failed; skipping image block");
    return null;
  }
}

const SEVERITY_EMOJI: Record<Recommendation["severity"], string> = {
  high: ":rotating_light:",
  med: ":warning:",
  low: ":information_source:",
};

export function formatRecommendationsLines(recs: Recommendation[]): string[] {
  if (!recs || recs.length === 0) return [];
  const lines: string[] = ["*Recommendations*"];
  for (const r of recs) {
    lines.push(
      `${SEVERITY_EMOJI[r.severity] ?? ":small_blue_diamond:"} *${r.severity.toUpperCase()}* ${escapeSlack(r.message)} _(${escapeSlack(r.evidence)})_`
    );
  }
  return lines;
}

const REVISITED_STATUS_EMOJI: Record<RevisitedEntry["status"], string> = {
  resolved: ":white_check_mark:",
  ongoing: ":arrows_counterclockwise:",
  worsened: ":warning:",
};

const REVISITED_STATUS_LABEL: Record<RevisitedEntry["status"], string> = {
  resolved: "Resolved",
  ongoing: "Still flagged",
  worsened: "Worsened",
};

/** English ordinal — handles 1st/2nd/3rd/4th-13th teens/everything else. */
function ordinal(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Loop-closure section: compares last week's recommendations to this week's
 * snapshot. Grouped by status (worsened > resolved > still-flagged). Returns
 * [] when no history exists (first week) so the section is omitted entirely.
 */
export function formatRevisitedLines(entries: RevisitedEntry[]): string[] {
  if (!entries || entries.length === 0) return [];
  const grouped: Record<RevisitedEntry["status"], RevisitedEntry[]> = {
    worsened: [],
    resolved: [],
    ongoing: [],
  };
  for (const e of entries) grouped[e.status].push(e);

  const lines: string[] = ["*Revisited from last week*"];
  // Render order: worsened first (most actionable), then resolved, then
  // ongoing.
  const order: Array<RevisitedEntry["status"]> = ["worsened", "resolved", "ongoing"];
  for (const status of order) {
    const items = grouped[status];
    if (items.length === 0) continue;
    lines.push(
      `${REVISITED_STATUS_EMOJI[status]} *${REVISITED_STATUS_LABEL[status]}* (${items.length})`
    );
    for (const e of items) {
      const consecutiveTag =
        status === "ongoing" && e.consecutiveWeeks && e.consecutiveWeeks >= 3
          ? ` _(${ordinal(e.consecutiveWeeks)} consecutive week)_`
          : "";
      const headlineMessage =
        status === "resolved" ? e.lastWeekMessage : (e.currentMessage ?? e.lastWeekMessage);
      const delta = e.deltaSummary ? ` — ${e.deltaSummary}` : "";
      lines.push(`• ${escapeSlack(headlineMessage)}${delta}${consecutiveTag}`);
    }
  }
  return lines;
}

export function formatLeakSeverityLines(leaks: LeakSeverity[]): string[] {
  if (!leaks || leaks.length === 0) return [];
  const lines: string[] = ["*Top funnel leaks by est. revenue impact*"];
  leaks.forEach((l, i) => {
    lines.push(
      `${i + 1}. ${escapeSlack(l.fromStage)} → ${escapeSlack(l.toStage)}: ${l.dropCount} dropped, ~${l.currency} ${Math.round(l.estLostRevenue).toLocaleString()} lost`
    );
  });
  return lines;
}

/**
 * Compose the daily digest as Block Kit. Returns blocks + fallback text. The
 * sparkline image is appended as the final block; when the snapshot is null
 * or the URL builder fails, the block is silently omitted (text fallback
 * still includes the section).
 */
export async function buildDailyBlocks(
  dayKey: string,
  curr: DailyMetrics,
  prev: DailyMetrics,
  partial?: PartialCapture | null
): Promise<{ blocks: SlackBlock[]; text: string }> {
  // `text` is the accessibility / notification-preview fallback — keeps the
  // Unicode sparkline section so plain-text consumers still see the trend.
  const text = formatDaily(dayKey, curr, prev, partial);

  // Try to build the PNG sparkline image FIRST. Only if it succeeds do we
  // strip the duplicate Unicode-char section from the in-channel block (so a
  // PNG failure still leaves users with the text version of the trend).
  let sparklineImageBlock: SlackBlock | null = null;
  if (curr.sparklines && curr.sparklines.days.length > 0) {
    const days = curr.sparklines.days;
    const url = await buildSignedImageUrl("sparklines", {
      windowLabel: `30 days ending ${dayKey} UTC`,
      // Compact parallel-array payload so the signed URL stays under Slack's
      // 3000-char image_url cap even at 30+ days.
      series: [
        days.map((d) => d.visitors),
        days.map((d) => d.starts),
        days.map((d) => d.completions),
        days.map((d) => d.report_views),
        days.map((d) => d.paywall_init),
        days.map((d) => d.purchases),
      ],
    });
    if (url) {
      sparklineImageBlock = {
        type: "image",
        image_url: url,
        alt_text: "30-day trend sparklines",
      };
    }
  }

  // If we have the PNG, strip the Unicode-char sparkline section from the
  // Block Kit section text (no in-channel duplication). Otherwise keep it so
  // users still see SOMETHING about the trend.
  let sectionText = text;
  if (sparklineImageBlock) {
    const idx = text.indexOf("*30-day trends*");
    if (idx >= 0) sectionText = text.slice(0, idx).trimEnd();
  }

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: sectionText },
    },
  ];
  if (sparklineImageBlock) blocks.push(sparklineImageBlock);
  return { blocks, text };
}

/**
 * Compose the weekly strategy supplement as Block Kit, interleaving PNG
 * images with mrkdwn sections. The composed message uses 4 image blocks +
 * leak text + recommendations text + answer-lift text.
 *
 * Returns null when every section is empty — the cron then skips the send.
 */
export async function buildWeeklyStrategyBlocks(
  weekKey: string,
  weekRangeLabel: string,
  curr: WeeklyMetrics
): Promise<{ blocks: SlackBlock[]; text: string } | null> {
  // Text fallback: reuse the existing all-text builder so a Slack client that
  // can't render Block Kit (or accessibility tools) still sees every section.
  const textFallback = formatWeeklyStrategySupplement(weekKey, weekRangeLabel, curr);
  if (!textFallback) return null;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🎯 Weekly funnel intelligence — ${weekKey}`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: weekRangeLabel }],
    },
  ];

  // 1. Drop-off funnel chart
  if (curr.dropoffEverywhere && curr.dropoffEverywhere.stages.length > 1) {
    const url = await buildSignedImageUrl("funnel", {
      weekLabel: weekRangeLabel,
      stages: curr.dropoffEverywhere.stages,
    });
    if (url) {
      blocks.push({
        type: "image",
        image_url: url,
        alt_text: "Drop-off funnel — all stages",
      });
    }
  }

  // 2. Top funnel leaks by revenue (text)
  const leakLines = formatLeakSeverityLines(curr.leakSeverity);
  if (leakLines.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: leakLines.join("\n") },
    });
  }

  // 3. Wizard funnel chart
  if (curr.wizardFunnel && curr.wizardFunnel.slide1 >= 3) {
    const url = await buildSignedImageUrl("wizard", {
      weekLabel: weekRangeLabel,
      slide1: curr.wizardFunnel.slide1,
      slide2: curr.wizardFunnel.slide2,
      slide3: curr.wizardFunnel.slide3,
      slide4: curr.wizardFunnel.slide4,
      slide5: curr.wizardFunnel.slide5,
      reportViewed: curr.wizardFunnel.reportViewed,
    });
    if (url) {
      blocks.push({
        type: "image",
        image_url: url,
        alt_text: "PreReportWizard slide-by-slide retention",
      });
    }
  }

  // 4. Recommendations (text)
  const recLines = formatRecommendationsLines(curr.recommendations);
  if (recLines.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: recLines.join("\n") },
    });
  }

  // 5. Engagement → purchase chart
  if (curr.engagementLift && curr.engagementLift.buckets.length > 0) {
    const url = await buildSignedImageUrl("engagement", {
      weekLabel: weekRangeLabel,
      buckets: curr.engagementLift.buckets,
    });
    if (url) {
      blocks.push({
        type: "image",
        image_url: url,
        alt_text: "Engagement-bucket purchase rate",
      });
    }
  }

  // 6. Top leaks chart (replaces some of the leak text with a chart)
  if (curr.leakSeverity.length > 0) {
    const url = await buildSignedImageUrl("leaks", {
      weekLabel: weekRangeLabel,
      currency: curr.leakSeverity[0]!.currency,
      leaks: curr.leakSeverity.map((l) => ({
        fromStage: l.fromStage,
        toStage: l.toStage,
        dropCount: l.dropCount,
        estLostRevenue: l.estLostRevenue,
      })),
    });
    if (url) {
      blocks.push({
        type: "image",
        image_url: url,
        alt_text: "Top funnel leaks ranked by revenue impact",
      });
    }
  }

  // 7. Answer → conversion lift (text — labels are too long for a chart)
  const answerLines = formatAnswerLift(curr.answerLift);
  if (answerLines.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: answerLines.join("\n") },
    });
  }

  // 8. Phase 3: loop-closure — "Revisited from last week".
  const revisitedLines = formatRevisitedLines(curr.revisited);
  if (revisitedLines.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: revisitedLines.join("\n") },
    });
  }

  // If we only have the header + context (everything else null), bail.
  if (blocks.length <= 2) return null;

  return { blocks, text: textFallback };
}

/**
 * Strategy-lead weekly supplement — a SECOND Slack message sent after the main
 * weekly digest on Mondays. Holds the four new sections (wizard funnel,
 * drop-off everywhere, answer→conversion lift, engagement→purchase lift).
 *
 * Sent separately rather than appended to formatWeekly because the combined
 * payload would routinely exceed Slack's 3000-char text-block cap and lose the
 * final sections to silent truncation. Splitting also gives the supplement its
 * own idempotency key so a partial Slack outage can deliver one half without
 * blocking the other.
 *
 * Returns null when every section is empty — the cron then skips the send so
 * the strategy lead doesn't get a useless "weekly strategy: (nothing)" ping.
 */
export function formatWeeklyStrategySupplement(
  weekKey: string,
  weekRangeLabel: string,
  curr: WeeklyMetrics
): string | null {
  const sections: string[][] = [];
  const wizard = formatWizardFunnel(curr.wizardFunnel);
  if (wizard.length > 0) sections.push(wizard);
  const dropoff = formatDropoffEverywhere(curr.dropoffEverywhere);
  if (dropoff.length > 0) sections.push(dropoff);
  const answer = formatAnswerLift(curr.answerLift);
  if (answer.length > 0) sections.push(answer);
  const engagement = formatEngagementLift(curr.engagementLift);
  if (engagement.length > 0) sections.push(engagement);
  // Phase 3 — loop-closure section in the text fallback so Block-Kit-less
  // clients still see the revisited classification.
  const revisited = formatRevisitedLines(curr.revisited);
  if (revisited.length > 0) sections.push(revisited);

  if (sections.length === 0) return null;

  const lines: string[] = [
    `:dart: *Weekly funnel intelligence — ${weekKey} (${weekRangeLabel})*`,
    "",
  ];
  for (let i = 0; i < sections.length; i += 1) {
    lines.push(...sections[i]!);
    if (i < sections.length - 1) lines.push("");
  }
  return clampToSlackLimit(lines.join("\n"));
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Skip on the staging Vercel project (shares the prod DB) — only one
  // daily digest per actual prod deploy.
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
    let weeklyStrategySent = false;

    // ---- Daily ----
    const dailyClaimed = await tryClaimSlackAlert("daily_digest", "day", dayKey);
    if (dailyClaimed) {
      const yesterdayIso = yesterdayStart.toISOString();
      // Parallel: metrics + the earliest-funnel_event probe. The probe tells
      // us whether visitor capture began before today's window — when it
      // didn't (e.g. funnel_event just shipped mid-day) the formatter adds a
      // partial-window caveat to the visitor + Saw-Q1 lines.
      const [curr, prev, captureStart] = await Promise.all([
        fetchDailyMetrics(yesterdayIso, dayStart.toISOString()),
        fetchDailyMetrics(dayBeforeStart.toISOString(), yesterdayIso),
        fetchFunnelCaptureStart(),
      ]);
      const dailyPartial =
        captureStart && captureStart > yesterdayIso
          ? { capturedFromIso: captureStart, windowStartIso: yesterdayIso }
          : null;
      const dailyComposed = await buildDailyBlocks(dayKey, curr, prev, dailyPartial);
      await notifySlack({
        channel: "ops",
        kind: "daily_digest",
        text: dailyComposed.text,
        blocks: dailyComposed.blocks,
        username: "ops_alerts",
      });
      // Mark delivered AFTER notify succeeds — if notify throws, the claim
      // stays delivered=false and the next eligible run (10+ min) re-claims.
      await markSlackAlertDelivered("daily_digest", "day", dayKey);
      dailySent = true;
    }

    // ---- Weekly (Mondays UTC, after the daily) ----
    if (now.getUTCDay() === 1) {
      const weekKey = isoWeekString(yesterdayStart);
      const weeklyClaimed = await tryClaimSlackAlert("weekly_digest", "week", weekKey);
      if (weeklyClaimed) {
        const weekStart = new Date(dayStart.getTime() - 7 * 86_400_000);
        const prevWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);
        const weekStartIso = weekStart.toISOString();
        const [currW, prevW, weeklyCaptureStart] = await Promise.all([
          fetchWeeklyMetrics(weekStartIso, dayStart.toISOString()),
          fetchWeeklyMetrics(prevWeekStart.toISOString(), weekStartIso),
          fetchFunnelCaptureStart(),
        ]);
        const rangeLabel = `${shortDate(weekStart)} → ${shortDate(new Date(dayStart.getTime() - 1))} UTC`;
        const weeklyPartial =
          weeklyCaptureStart && weeklyCaptureStart > weekStartIso
            ? { capturedFromIso: weeklyCaptureStart, windowStartIso: weekStartIso }
            : null;
        await notifySlack({
          channel: "ops",
          kind: "weekly_digest",
          text: formatWeekly(weekKey, rangeLabel, currW, prevW, weeklyPartial),
          username: "ops_alerts",
        });
        await markSlackAlertDelivered("weekly_digest", "week", weekKey);
        weeklySent = true;

        // ---- Weekly strategy supplement (second Slack message) ----
        // Independent idempotency key so a one-off Slack outage that delivers
        // the main weekly but not the supplement (or vice versa) can be
        // re-attempted by the next cron tick without double-sending the half
        // that already landed.
        const supplementClaimed = await tryClaimSlackAlert(
          "weekly_strategy_supplement",
          "week",
          weekKey
        );
        if (supplementClaimed) {
          // Prefer the visual Block Kit composition; falls back to text-only
          // when the image URL builder fails or no sections have data.
          const supplementBlocks = await buildWeeklyStrategyBlocks(weekKey, rangeLabel, currW);
          if (supplementBlocks) {
            await notifySlack({
              channel: "ops",
              kind: "weekly_strategy_supplement",
              text: supplementBlocks.text,
              blocks: supplementBlocks.blocks,
              username: "ops_alerts",
            });
            await markSlackAlertDelivered("weekly_strategy_supplement", "week", weekKey);
            weeklyStrategySent = true;
          } else {
            const supplementText = formatWeeklyStrategySupplement(weekKey, rangeLabel, currW);
            if (supplementText) {
              await notifySlack({
                channel: "ops",
                kind: "weekly_strategy_supplement",
                text: supplementText,
                username: "ops_alerts",
              });
              await markSlackAlertDelivered("weekly_strategy_supplement", "week", weekKey);
              weeklyStrategySent = true;
            } else {
              // Nothing to say this week (every section empty / null
              // snapshots). Still mark delivered so we don't re-attempt every
              // 10 minutes for the rest of Monday.
              await markSlackAlertDelivered("weekly_strategy_supplement", "week", weekKey);
            }
          }

          // Phase 3 — persist this week's recommendations AFTER notifySlack
          // succeeds so a DB outage cannot block (or partially block) the
          // digest. persistRecommendations is best-effort: any failure is
          // logged with logger.warn and we continue.
          if (weeklyStrategySent && currW.recommendations.length > 0) {
            await persistRecommendations(weekKey, currW.recommendations);
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      day: dayKey,
      dailySent,
      weeklySent,
      weeklyStrategySent,
    });
  } catch (err) {
    logger.error({ err }, "funnel-digest cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("funnel-digest", startMs, cronError ? "error" : "success", cronError);
  }
}
