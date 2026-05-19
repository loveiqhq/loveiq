/**
 * Shared metric fetchers for the daily + weekly Slack digest and the
 * on-demand /api/admin/digest HTML report. Both surfaces consume the
 * same query path so the numbers never diverge.
 *
 * Every query is a HEAD (count=exact) or a small SELECT — kept light
 * enough that a full digest run fits inside Vercel's 60s cron budget
 * with all queries running in Promise.all.
 */

import { Redis } from "@upstash/redis";
import { supabaseFetch } from "@features/admin/server/supabase";
import { parseUtmSource } from "@features/admin/server/metric-library";
import logger from "@shared/observability/logger";

export { parseUtmSource };

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RevenueBreakdown {
  count: number;
  byCurrency: Record<string, number>;
  planMix: { essentials: number; full_report: number; all_reports: number };
  promoRedemptions: number;
}

export interface DailyMetrics {
  // Acquisition
  surveyStarts: number;
  completions: number;
  completionRate: number; // 0-100
  waitlist: number;
  // Activation
  reportViewers: number;
  deepEngagement: number;
  paywallViews: number;
  beginCheckouts: number;
  // Revenue
  revenue: RevenueBreakdown;
  refunds: number;
  refundAmount: number;
  failedPayments: number;
  disputes: number;
  // Engagement
  invites: number;
  shares: number;
  thumbsUp: number;
  thumbsDown: number;
  // Email health
  bounces: number;
  complaints: number;
  unsubscribes: number;
  // Email engagement (aggregate counters from KV, populated by Resend webhook)
  emailOpened: number;
  emailClicked: number;
  // Top breakdowns
  topArchetypes: Array<[string, number]>;
  topUtmSources: Array<[string, number]>;
}

export interface FunnelStages {
  starts: number;
  completions: number;
  reportViewed: number;
  paywallViewed: number;
  purchased: number;
}

export interface WeeklyMetrics extends DailyMetrics {
  avgCompletionSec: number;
  funnel: FunnelStages;
  worstChapters: Array<{ sectionId: string; downs: number }>;
  topIssues: Array<{ issue: string; count: number }>;
  dropOff: Array<{ questionIndex: number; abandonCount: number }>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Percentage change with a low-base annotation. */
export function delta(curr: number, prev: number, lowBaseThreshold = 5): string {
  if (prev === 0) return curr > 0 ? "+∞%" : "—";
  const pct = Math.round(((curr - prev) / prev) * 100);
  const capped = Math.max(-999, Math.min(999, pct));
  const sign = capped > 0 ? "+" : "";
  const suffix = prev < lowBaseThreshold ? " (low base)" : "";
  return `${sign}${capped}%${suffix}`;
}

/** ISO 8601 week string like "2026-W20" (Mon-Sun). */
export function isoWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/** YYYY-MM-DD for the UTC day this date falls in. */
export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchExactCount(path: string): Promise<number> {
  const res = await supabaseFetch(path, {
    method: "HEAD",
    headers: { Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range");
  if (!range) return 0;
  const total = range.split("/")[1];
  return total && total !== "*" ? parseInt(total, 10) : 0;
}

/** `gte` + `lt` range encoded for a single column. */
function dateRange(column: string, sinceIso: string, untilIso: string): string {
  return `${column}=gte.${encodeURIComponent(sinceIso)}&${column}=lt.${encodeURIComponent(untilIso)}`;
}

/**
 * Distinct count via small page + Set (PostgREST has no DISTINCT op).
 * Capped at `limit`. When the result hits the cap, emits a structured
 * warn log (NOT an error — no ops Slack alert, just a Vercel log entry)
 * so we know the digest number is a floor, not the truth.
 */
async function fetchDistinct<T extends string | number>(
  path: string,
  field: string,
  limit = 5000
): Promise<number> {
  const res = await supabaseFetch(path, { headers: { Range: `0-${limit - 1}` } });
  if (!res.ok) return 0;
  const rows = (await res.json()) as Array<Record<string, T | null>>;
  if (rows.length >= limit) {
    logger.warn(
      { path, field, limit, returned: rows.length },
      "fetchDistinct: page cap hit — distinct count is a floor, true number may be higher"
    );
  }
  const set = new Set<T>();
  for (const r of rows) {
    const v = r[field];
    if (v !== null && v !== undefined) set.add(v);
  }
  return set.size;
}

// -----------------------------------------------------------------------------
// Individual metric fetchers
// -----------------------------------------------------------------------------

async function fetchSurveyStarts(sinceIso: string, untilIso: string): Promise<number> {
  // Distinct session_id in survey_partial_save = one per started survey.
  return fetchDistinct(
    `/rest/v1/survey_partial_save?select=session_id&${dateRange("started_at", sinceIso, untilIso)}`,
    "session_id"
  );
}

async function fetchCompletions(sinceIso: string, untilIso: string): Promise<number> {
  return fetchExactCount(
    `/rest/v1/survey_submission?select=id&status=eq.completed&${dateRange("created_date_time", sinceIso, untilIso)}`
  );
}

async function fetchWaitlist(sinceIso: string, untilIso: string): Promise<number> {
  return fetchExactCount(
    `/rest/v1/waitlist_user?select=id&${dateRange("created_date_time", sinceIso, untilIso)}`
  );
}

async function fetchAnalyticsEventCount(
  eventType: string,
  sinceIso: string,
  untilIso: string
): Promise<number> {
  return fetchExactCount(
    `/rest/v1/analytics_event?select=id&event_type=eq.${eventType}&${dateRange("event_time", sinceIso, untilIso)}`
  );
}

async function fetchDistinctReportViewers(sinceIso: string, untilIso: string): Promise<number> {
  return fetchDistinct(
    `/rest/v1/analytics_event?select=survey_submission_id&event_type=eq.report_viewed&${dateRange("event_time", sinceIso, untilIso)}`,
    "survey_submission_id"
  );
}

/**
 * Fetches every succeeded payment in the window and aggregates: count,
 * revenue by currency, plan mix, promo redemptions. One query, many derived
 * metrics. Capped at 1000 payments per window — beyond that we'd need to
 * paginate, which yesterday's volume is nowhere near.
 */
async function fetchRevenue(sinceIso: string, untilIso: string): Promise<RevenueBreakdown> {
  const res = await supabaseFetch(
    `/rest/v1/payment?select=amount,currency,metadata&status=eq.succeeded&${dateRange("created_date_time", sinceIso, untilIso)}`,
    { headers: { Range: "0-999" } }
  );
  if (!res.ok)
    return {
      count: 0,
      byCurrency: {},
      planMix: { essentials: 0, full_report: 0, all_reports: 0 },
      promoRedemptions: 0,
    };

  const rows = (await res.json()) as Array<{
    amount: number | string | null;
    currency: string | null;
    metadata: Record<string, unknown> | null;
  }>;

  const byCurrency: Record<string, number> = {};
  const planMix = { essentials: 0, full_report: 0, all_reports: 0 };
  let promoRedemptions = 0;

  for (const row of rows) {
    const amount = typeof row.amount === "string" ? parseFloat(row.amount) : (row.amount ?? 0);
    const currency = (row.currency || "EUR").toUpperCase();
    byCurrency[currency] = (byCurrency[currency] ?? 0) + (Number.isFinite(amount) ? amount : 0);

    const plan = row.metadata && (row.metadata.plan as string | undefined);
    if (plan === "essentials" || plan === "full_report" || plan === "all_reports") {
      planMix[plan] += 1;
    }
    const promo = row.metadata && (row.metadata.promotionCode as string | undefined);
    if (promo) promoRedemptions += 1;
  }

  return { count: rows.length, byCurrency, planMix, promoRedemptions };
}

async function fetchRefunds(
  sinceIso: string,
  untilIso: string
): Promise<{ count: number; amount: number }> {
  const res = await supabaseFetch(
    `/rest/v1/payment?select=refund_amount&status=eq.refunded&${dateRange("refunded_at", sinceIso, untilIso)}`,
    { headers: { Range: "0-999" } }
  );
  if (!res.ok) return { count: 0, amount: 0 };
  const rows = (await res.json()) as Array<{ refund_amount: number | string | null }>;
  let amount = 0;
  for (const r of rows) {
    const a =
      typeof r.refund_amount === "string" ? parseFloat(r.refund_amount) : (r.refund_amount ?? 0);
    if (Number.isFinite(a)) amount += a;
  }
  return { count: rows.length, amount };
}

async function fetchPaymentCountByStatus(
  status: string,
  sinceIso: string,
  untilIso: string
): Promise<number> {
  return fetchExactCount(
    `/rest/v1/payment?select=id&status=eq.${status}&${dateRange("created_date_time", sinceIso, untilIso)}`
  );
}

async function fetchInvitesSent(sinceIso: string, untilIso: string): Promise<number> {
  return fetchExactCount(
    `/rest/v1/invite_event?select=id&${dateRange("created_at", sinceIso, untilIso)}`
  );
}

async function fetchSharesCreated(sinceIso: string, untilIso: string): Promise<number> {
  return fetchExactCount(
    `/rest/v1/report_share?select=id&${dateRange("created_at", sinceIso, untilIso)}`
  );
}

async function fetchFeedbackCounts(
  sinceIso: string,
  untilIso: string
): Promise<{ up: number; down: number }> {
  const [up, down] = await Promise.all([
    fetchExactCount(
      `/rest/v1/report_section_feedback?select=id&feedback=eq.up&${dateRange("created_at", sinceIso, untilIso)}`
    ),
    fetchExactCount(
      `/rest/v1/report_section_feedback?select=id&feedback=eq.down&${dateRange("created_at", sinceIso, untilIso)}`
    ),
  ]);
  return { up, down };
}

async function fetchSuppressionByReason(
  reason: string,
  sinceIso: string,
  untilIso: string
): Promise<number> {
  return fetchExactCount(
    `/rest/v1/email_suppression?select=id&reason=eq.${reason}&${dateRange("created_at", sinceIso, untilIso)}`
  );
}

async function fetchTopArchetypes(
  sinceIso: string,
  untilIso: string,
  limit = 5
): Promise<Array<[string, number]>> {
  const res = await supabaseFetch(
    `/rest/v1/scoring_result?select=v5_primary_archetype,primary_archetype&${dateRange("scored_at", sinceIso, untilIso)}`,
    { headers: { Range: "0-4999" } }
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{
    v5_primary_archetype: string | null;
    primary_archetype: string | null;
  }>;
  const counts = new Map<string, number>();
  for (const r of rows) {
    // Prefer v5 — matches what the user actually sees on /report
    const name = r.v5_primary_archetype || r.primary_archetype;
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

async function fetchTopUtmSources(
  sinceIso: string,
  untilIso: string,
  limit = 5
): Promise<Array<[string, number]>> {
  const res = await supabaseFetch(
    `/rest/v1/survey_submission?select=utm_tracker&${dateRange("created_date_time", sinceIso, untilIso)}`,
    { headers: { Range: "0-9999" } }
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ utm_tracker: string | null }>;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const src = parseUtmSource(r.utm_tracker);
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * Email engagement counters live in Upstash KV (populated by the Resend
 * webhook on `email.opened` / `email.clicked`). One key per kind per UTC
 * day with 8-day TTL.
 *
 * The Redis client is a module-level singleton — every call to
 * fetchDailyMetrics / fetchWeeklyMetrics would otherwise build a fresh
 * Upstash HTTP client, and the weekly digest runs `fetchDailyMetrics`
 * twice in a single tick (current + prior window).
 */
let _engagementRedis: Redis | null | undefined;
function getEngagementRedis(): Redis | null {
  if (_engagementRedis !== undefined) return _engagementRedis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  _engagementRedis = url && token ? new Redis({ url, token }) : null;
  return _engagementRedis;
}

async function fetchEmailEngagement(sinceIso: string): Promise<{
  opened: number;
  clicked: number;
}> {
  const redis = getEngagementRedis();
  if (!redis) return { opened: 0, clicked: 0 };
  // Use the UTC day from `sinceIso` (the start of the digest window).
  const day = sinceIso.slice(0, 10);
  try {
    const [openedRaw, clickedRaw] = await redis.mget(
      `email_engage:opened:${day}`,
      `email_engage:clicked:${day}`
    );
    const toNum = (v: unknown): number =>
      typeof v === "number" ? v : v == null ? 0 : Number(v) || 0;
    return { opened: toNum(openedRaw), clicked: toNum(clickedRaw) };
  } catch {
    return { opened: 0, clicked: 0 };
  }
}

async function fetchAvgCompletionMs(sinceIso: string, untilIso: string): Promise<number> {
  const res = await supabaseFetch(
    `/rest/v1/survey_submission?select=duration_ms&status=eq.completed&${dateRange("created_date_time", sinceIso, untilIso)}`,
    { headers: { Range: "0-4999" } }
  );
  if (!res.ok) return 0;
  const rows = (await res.json()) as Array<{ duration_ms: number | null }>;
  const durations = rows.map((r) => r.duration_ms).filter((d): d is number => d != null && d > 0);
  if (durations.length === 0) return 0;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

// -----------------------------------------------------------------------------
// Funnel + quality fetchers (weekly only)
// -----------------------------------------------------------------------------

export async function fetchFunnelStages(sinceIso: string, untilIso: string): Promise<FunnelStages> {
  const [starts, completions, reportViewed, paywallViewed, purchasedRows] = await Promise.all([
    fetchSurveyStarts(sinceIso, untilIso),
    fetchCompletions(sinceIso, untilIso),
    fetchDistinctReportViewers(sinceIso, untilIso),
    fetchDistinct(
      `/rest/v1/analytics_event?select=survey_submission_id&event_type=eq.paywall_view&${dateRange("event_time", sinceIso, untilIso)}`,
      "survey_submission_id"
    ),
    supabaseFetch(
      `/rest/v1/payment?select=user_id&status=eq.succeeded&${dateRange("created_date_time", sinceIso, untilIso)}`,
      { headers: { Range: "0-999" } }
    ),
  ]);

  let purchased = 0;
  if (purchasedRows.ok) {
    const rows = (await purchasedRows.json()) as Array<{ user_id: number | null }>;
    const seen = new Set<number>();
    for (const r of rows) {
      if (r.user_id != null) seen.add(r.user_id);
    }
    purchased = seen.size;
  }

  return { starts, completions, reportViewed, paywallViewed, purchased };
}

export async function fetchDropOffQuestions(
  sinceIso: string,
  untilIso: string,
  limit = 3
): Promise<Array<{ questionIndex: number; abandonCount: number }>> {
  const res = await supabaseFetch(
    `/rest/v1/survey_behavior_event?select=question_index&direction=eq.abandon&${dateRange("event_time", sinceIso, untilIso)}`,
    { headers: { Range: "0-4999" } }
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ question_index: number | null }>;
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.question_index == null) continue;
    counts.set(r.question_index, (counts.get(r.question_index) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([questionIndex, abandonCount]) => ({ questionIndex, abandonCount }))
    .sort((a, b) => b.abandonCount - a.abandonCount)
    .slice(0, limit);
}

export async function fetchWorstRatedChapters(
  sinceIso: string,
  untilIso: string,
  limit = 3
): Promise<Array<{ sectionId: string; downs: number }>> {
  const res = await supabaseFetch(
    `/rest/v1/report_section_feedback?select=section_id&feedback=eq.down&${dateRange("created_at", sinceIso, untilIso)}`,
    { headers: { Range: "0-999" } }
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ section_id: string | null }>;
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.section_id) continue;
    counts.set(r.section_id, (counts.get(r.section_id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([sectionId, downs]) => ({ sectionId, downs }))
    .sort((a, b) => b.downs - a.downs)
    .slice(0, limit);
}

export async function fetchTopIssueCategories(
  sinceIso: string,
  untilIso: string,
  limit = 3
): Promise<Array<{ issue: string; count: number }>> {
  const res = await supabaseFetch(
    `/rest/v1/report_section_feedback?select=issue&feedback=eq.down&issue=not.is.null&${dateRange("created_at", sinceIso, untilIso)}`,
    { headers: { Range: "0-999" } }
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ issue: string | null }>;
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.issue) continue;
    counts.set(r.issue, (counts.get(r.issue) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// -----------------------------------------------------------------------------
// Top-level orchestrators
// -----------------------------------------------------------------------------

export async function fetchDailyMetrics(sinceIso: string, untilIso: string): Promise<DailyMetrics> {
  const [
    surveyStarts,
    completions,
    waitlist,
    reportViewers,
    deepEngagement,
    paywallViews,
    beginCheckouts,
    revenue,
    refunds,
    failedPayments,
    disputes,
    invites,
    shares,
    feedback,
    bounces,
    complaints,
    unsubscribes,
    emailEngagement,
    topArchetypes,
    topUtmSources,
  ] = await Promise.all([
    fetchSurveyStarts(sinceIso, untilIso),
    fetchCompletions(sinceIso, untilIso),
    fetchWaitlist(sinceIso, untilIso),
    fetchDistinctReportViewers(sinceIso, untilIso),
    fetchAnalyticsEventCount("report_engagement_10min", sinceIso, untilIso),
    fetchAnalyticsEventCount("paywall_view", sinceIso, untilIso),
    fetchAnalyticsEventCount("begin_checkout", sinceIso, untilIso),
    fetchRevenue(sinceIso, untilIso),
    fetchRefunds(sinceIso, untilIso),
    fetchPaymentCountByStatus("failed", sinceIso, untilIso),
    fetchPaymentCountByStatus("disputed", sinceIso, untilIso),
    fetchInvitesSent(sinceIso, untilIso),
    fetchSharesCreated(sinceIso, untilIso),
    fetchFeedbackCounts(sinceIso, untilIso),
    fetchSuppressionByReason("hard_bounce", sinceIso, untilIso),
    fetchSuppressionByReason("complaint", sinceIso, untilIso),
    fetchSuppressionByReason("unsubscribed", sinceIso, untilIso),
    fetchEmailEngagement(sinceIso),
    fetchTopArchetypes(sinceIso, untilIso, 3),
    fetchTopUtmSources(sinceIso, untilIso, 3),
  ]);

  const completionRate = surveyStarts > 0 ? Math.round((completions / surveyStarts) * 100) : 0;

  return {
    surveyStarts,
    completions,
    completionRate,
    waitlist,
    reportViewers,
    deepEngagement,
    paywallViews,
    beginCheckouts,
    revenue,
    refunds: refunds.count,
    refundAmount: refunds.amount,
    failedPayments,
    disputes,
    invites,
    shares,
    thumbsUp: feedback.up,
    thumbsDown: feedback.down,
    bounces,
    complaints,
    unsubscribes,
    emailOpened: emailEngagement.opened,
    emailClicked: emailEngagement.clicked,
    topArchetypes,
    topUtmSources,
  };
}

export async function fetchWeeklyMetrics(
  sinceIso: string,
  untilIso: string
): Promise<WeeklyMetrics> {
  const [daily, avgCompletionMs, funnel, worstChapters, topIssues, dropOff] = await Promise.all([
    fetchDailyMetrics(sinceIso, untilIso),
    fetchAvgCompletionMs(sinceIso, untilIso),
    fetchFunnelStages(sinceIso, untilIso),
    fetchWorstRatedChapters(sinceIso, untilIso, 3),
    fetchTopIssueCategories(sinceIso, untilIso, 3),
    fetchDropOffQuestions(sinceIso, untilIso, 3),
  ]);

  // For the weekly view we want top-5 (not top-3) of archetypes + UTM.
  const [topArchetypesFive, topUtmSourcesFive] = await Promise.all([
    fetchTopArchetypes(sinceIso, untilIso, 5),
    fetchTopUtmSources(sinceIso, untilIso, 5),
  ]);

  return {
    ...daily,
    topArchetypes: topArchetypesFive,
    topUtmSources: topUtmSourcesFive,
    avgCompletionSec: Math.round(avgCompletionMs / 1000),
    funnel,
    worstChapters,
    topIssues,
    dropOff,
  };
}
