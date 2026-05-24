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
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
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
      await notifySlack({
        channel: "ops",
        kind: "daily_digest",
        text: formatDaily(dayKey, curr, prev, dailyPartial),
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
      }
    }

    return NextResponse.json({
      ok: true,
      day: dayKey,
      dailySent,
      weeklySent,
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
