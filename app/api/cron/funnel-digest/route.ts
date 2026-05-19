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
import { notifySlack } from "@shared/observability/slack";
import {
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

// -----------------------------------------------------------------------------
// Daily message
// -----------------------------------------------------------------------------

function formatDaily(dayKey: string, curr: DailyMetrics, prev: DailyMetrics): string {
  const lines = [`:bar_chart: *Daily digest — ${dayKey} UTC*`, ""];

  lines.push("*Acquisition*");
  lines.push(metricWithDelta("Survey starts", curr.surveyStarts, prev.surveyStarts));
  lines.push(
    `• Completions: ${curr.completions} (${curr.completionRate}% rate, DoD: ${delta(curr.completionRate, prev.completionRate)})`
  );
  lines.push("");

  lines.push("*Activation*");
  lines.push(metricWithDelta("Report viewers", curr.reportViewers, prev.reportViewers));
  lines.push(metricWithDelta("Engagement 1m+", curr.engagement1min, prev.engagement1min));
  lines.push(metricWithDelta("Engagement 5m+", curr.engagement5min, prev.engagement5min));
  lines.push(metricWithDelta("Engagement 10m+", curr.engagement10min, prev.engagement10min));
  lines.push(metricWithDelta("Paywall views", curr.paywallViews, prev.paywallViews));
  lines.push(metricWithDelta("Begin checkouts", curr.beginCheckouts, prev.beginCheckouts));
  lines.push("");

  lines.push("*Revenue*");
  lines.push(
    `• Purchases: ${curr.revenue.count} — ${formatCurrency(curr.revenue.byCurrency)} (DoD: ${delta(curr.revenue.count, prev.revenue.count)})`
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

  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Weekly message
// -----------------------------------------------------------------------------

function metricWithWow(label: string, curr: number, prev: number, unit = ""): string {
  return `• ${label}: ${curr}${unit} (WoW: ${delta(curr, prev)})`;
}

function formatWeekly(
  weekKey: string,
  weekRangeLabel: string,
  curr: WeeklyMetrics,
  prev: WeeklyMetrics
): string {
  const lines = [`:chart_with_upwards_trend: *Weekly digest — ${weekKey} (${weekRangeLabel})*`, ""];

  lines.push("*Acquisition*");
  lines.push(metricWithWow("Survey starts", curr.surveyStarts, prev.surveyStarts));
  lines.push(
    `• Completions: ${curr.completions} (${curr.completionRate}% rate, WoW: ${delta(curr.completionRate, prev.completionRate)})`
  );
  lines.push(`• Avg completion time: ${curr.avgCompletionSec}s`);
  lines.push("");

  lines.push("*Activation*");
  lines.push(metricWithWow("Report viewers", curr.reportViewers, prev.reportViewers));
  lines.push(metricWithWow("Engagement 1m+", curr.engagement1min, prev.engagement1min));
  lines.push(metricWithWow("Engagement 5m+", curr.engagement5min, prev.engagement5min));
  lines.push(metricWithWow("Engagement 10m+", curr.engagement10min, prev.engagement10min));
  lines.push(metricWithWow("Paywall views", curr.paywallViews, prev.paywallViews));
  lines.push(metricWithWow("Begin checkouts", curr.beginCheckouts, prev.beginCheckouts));
  lines.push("");

  lines.push("*Revenue*");
  lines.push(
    `• Purchases: ${curr.revenue.count} — ${formatCurrency(curr.revenue.byCurrency)} (WoW: ${delta(curr.revenue.count, prev.revenue.count)})`
  );
  lines.push(`• Plan mix: ${formatPlanMix(curr.revenue.planMix)}`);
  lines.push(
    `• Refunds: ${curr.refunds} (${curr.refundAmount.toFixed(2)}) | Failed: ${curr.failedPayments} | Disputes: ${curr.disputes}`
  );
  lines.push(
    metricWithWow("Promo redemptions", curr.revenue.promoRedemptions, prev.revenue.promoRedemptions)
  );
  lines.push("");

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

  // Conversion funnel
  const f = curr.funnel;
  const stageKept = (curr: number, prev: number): string =>
    prev > 0 ? `${Math.round((curr / prev) * 100)}% kept` : "—";
  lines.push("*Conversion funnel*");
  lines.push(`• Survey starts: ${f.starts}`);
  lines.push(`• Completions: ${f.completions} (${stageKept(f.completions, f.starts)})`);
  lines.push(`• Report viewed: ${f.reportViewed} (${stageKept(f.reportViewed, f.completions)})`);
  lines.push(
    `• Paywall viewed: ${f.paywallViewed} (${stageKept(f.paywallViewed, f.reportViewed)})`
  );
  lines.push(`• Purchased: ${f.purchased} (${stageKept(f.purchased, f.paywallViewed)})`);
  const overallPct = f.starts > 0 ? `${((f.purchased / f.starts) * 100).toFixed(2)}%` : "—";
  lines.push(`• Overall conversion: ${overallPct} (starts → purchased)`);
  lines.push("");

  lines.push("*Top breakdowns*");
  lines.push(`• Archetypes: ${formatTopList(curr.topArchetypes)}`);
  lines.push(`• Sources: ${formatTopList(curr.topUtmSources)}`);
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

  return lines.join("\n");
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

  const trackDuration = startCronTimer("funnel-digest", 60);

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
      const [curr, prev] = await Promise.all([
        fetchDailyMetrics(yesterdayStart.toISOString(), dayStart.toISOString()),
        fetchDailyMetrics(dayBeforeStart.toISOString(), yesterdayStart.toISOString()),
      ]);
      await notifySlack({
        channel: "ops",
        kind: "daily_digest",
        text: formatDaily(dayKey, curr, prev),
        username: "ops_alerts",
      });
      dailySent = true;
    }

    // ---- Weekly (Mondays UTC, after the daily) ----
    if (now.getUTCDay() === 1) {
      const weekKey = isoWeekString(yesterdayStart);
      const weeklyClaimed = await tryClaimSlackAlert("weekly_digest", "week", weekKey);
      if (weeklyClaimed) {
        const weekStart = new Date(dayStart.getTime() - 7 * 86_400_000);
        const prevWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);
        const [currW, prevW] = await Promise.all([
          fetchWeeklyMetrics(weekStart.toISOString(), dayStart.toISOString()),
          fetchWeeklyMetrics(prevWeekStart.toISOString(), weekStart.toISOString()),
        ]);
        const rangeLabel = `${shortDate(weekStart)} → ${shortDate(new Date(dayStart.getTime() - 1))} UTC`;
        await notifySlack({
          channel: "ops",
          kind: "weekly_digest",
          text: formatWeekly(weekKey, rangeLabel, currW, prevW),
          username: "ops_alerts",
        });
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
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
  }
}
