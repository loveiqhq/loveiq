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
import {
  buildChannelEfficiencySnapshot,
  type ChannelEfficiencySnapshot,
} from "@features/admin/server/channel-efficiency";
import {
  buildConversionLeakDebuggerSnapshot,
  type ConversionLeakDebuggerSnapshot,
} from "@features/admin/server/conversion-leak-debugger";
import { buildAnomalySnapshot } from "@features/admin/server/alerts";
import type { AdminAnomalySnapshot } from "@features/admin/server/os-types";
import {
  buildValueRealizationSnapshot,
  type ValueRealizationSnapshot,
} from "@features/admin/server/value-realization";
// Pure derived-field builders. These modules use `import type` from this file
// so static imports do NOT create a runtime circular dep (the type imports
// are erased by TypeScript).
import { scoreFunnelLeaks } from "@features/admin/server/digest-leak-scoring";
import { buildRecommendations } from "@features/admin/server/digest-recommendations";
import { fetchRecommendationHistory } from "@features/admin/server/digest-recommendation-history";
import {
  classifyRevisited,
  type RevisitedEntry,
} from "@features/admin/server/digest-recommendation-compare";

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
  uniqueVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  surveyEngineMounts: number;
  surveyStarts: number;
  completions: number;
  completionRate: number; // 0-100
  // Hour-of-day distribution of completed submissions in the window (top 3).
  topCompletionHours: Array<{ hour: number; count: number }>;
  // Activation
  reportViewers: number;
  engagement1min: number;
  engagement5min: number;
  engagement10min: number;
  /**
   * User-initiated paywall surface count. Sources: lock_click (clicked a
   * locked section), archetype_unlock (clicked Unlock on an archetype tile),
   * offer_link (followed an `?offer=1` email deep-link). Auto-mounted
   * surfaces (scroll teaser, 24h+ ladder auto-open) deliberately don't fire
   * this — they count as "forced exposure" per the founder's 2026-05-24
   * direction.
   */
  paywallInitiated: number;
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
  // Strategy-lead snapshots (nullable: a failure in any one snapshot must not
  // break the whole digest — each renderer treats null as "skip section").
  channels: ChannelEfficiencySnapshot | null;
  leak: ConversionLeakDebuggerSnapshot | null;
  anomalies: AdminAnomalySnapshot | null;
  monetization: ValueRealizationSnapshot | null;
  // Median paywall-view → purchase time in hours (computed in-line because
  // value-realization snapshot doesn't expose this directly).
  medianTimeToPurchaseHours: number | null;
  /**
   * PreReportWizard slide-by-slide retention. Nullable per the safeSnapshot
   * convention: a single fetcher failure is logged + the section skipped, but
   * the rest of the digest still ships.
   */
  wizardFunnel: WizardSlideRetentionSnapshot | null;
  /**
   * 30-day daily-bucketed top-line metrics for inline Unicode sparklines on
   * the daily digest. Always covers the trailing 30 UTC days regardless of
   * the digest window itself (one digest sentence, "trend over 30 days"). Null
   * when the fetcher fails.
   */
  sparklines: SparklineSnapshot | null;
  /**
   * 30-day phase-bucketed sparklines — intro / per-chapter survey / wizard /
   * monetize. Renders four longitudinal chart images in the chart-dominant
   * Slack digest. Same trailing-30d window as `sparklines`. Null on RPC
   * failure → renderer omits all four image blocks (text section unaffected).
   */
  extendedSparklines: ExtendedSparklineSnapshot | null;
  /**
   * Phase 2 superset of extendedSparklines — same per-day rows PLUS 4 new
   * fixed-key buckets (pricing, ux, payment_health, invite). Wraps the v3
   * RPC. Null on RPC failure; renderer omits all v3-only image blocks but
   * the existing v2-derived charts still ship via `extendedSparklines`.
   */
  extendedSparklinesV3: ExtendedSparklineV3Snapshot | null;
  /**
   * Per-source per-day funnel counts (starts / completions / purchases).
   * Top-5 sources by total volume drive the chart; the snapshot itself keeps
   * ALL sources so Node-side ranking is stable across re-runs.
   * Renamed from `channels` to avoid collision with existing
   * `channels: ChannelEfficiencySnapshot` (different domain, same noun).
   */
  channelSparklines: ChannelSparklineSnapshot | null;
  /** Per-archetype per-day completions + purchases. Top-N filtered Node-side. */
  archetypeSparklines: ArchetypeSparklineSnapshot | null;
  /** Daily p50/p75/p90 paywall→purchase hours. */
  velocitySparklines: VelocitySnapshot | null;
}

export interface FunnelStages {
  uniqueVisitors: number;
  engineMounts: number;
  starts: number;
  completions: number;
  reportViewed: number;
  /**
   * Distinct submissions that initiated the paywall (user-click). Replaces
   * the prior `paywallViewed` metric on 2026-05-24 — see `paywallInitiated`
   * docstring in DailyMetrics.
   */
  paywallInitiated: number;
  purchased: number;
}

/**
 * PreReportWizard slide-by-slide retention. `slide1..slide5` = distinct
 * submissions that reached that slide via `wizard_slide_advanced`. `reportViewed`
 * = subset that ALSO opened the report inside the same window. Renderer
 * computes "% kept" from the previous slide inline.
 */
export interface WizardSlideRetentionSnapshot {
  slide1: number;
  slide2: number;
  slide3: number;
  slide4: number;
  slide5: number;
  reportViewed: number;
}

/**
 * One row per UTC day in the digest window. Renderer maps each metric column
 * across days to a Unicode-block sparkline string for the daily Slack message.
 */
export interface SparklineDay {
  day: string; // YYYY-MM-DD
  visitors: number;
  starts: number;
  completions: number;
  report_views: number;
  paywall_init: number;
  purchases: number;
}

export interface SparklineSnapshot {
  days: SparklineDay[];
}

/**
 * Phase-bucketed extended sparkline — one row per UTC day with per-stage
 * counts across the whole drop-off funnel. Powers the four NEW longitudinal
 * chart images in the daily + weekly Slack digest (intro / survey-by-chapter /
 * wizard / monetize). Adjacent to the existing top-line `sparklines` so a
 * digest run can pull both in parallel.
 *
 * Zero-traffic days still emit rows (server-side `days` generate_series spine
 * in get_funnel_sparklines_v2) so the renderer always sees a fixed-width N.
 */
export interface IntroSparklineBuckets {
  s1: number;
  s2: number;
  s3: number;
  s4: number;
}

export interface WizardSparklineBuckets {
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  s6: number;
  report_viewed: number;
}

export interface MonetizeSparklineBuckets {
  report_viewed: number;
  engagement_5min: number;
  paywall_init: number;
  begin_checkout: number;
  purchased: number;
}

/**
 * Per-chapter daily counts. Keyed by zero-padded chapter prefix derived from
 * the survey-question 5-digit `CCQQQ` code (e.g. `"00"`, `"01"`, …, `"16"`).
 * Missing chapters mean zero on that UTC day. Renderer iterates a fixed
 * 0..16 range so chart axis width is stable across the window.
 */
export type SurveyChapterCounts = Record<string, number>;

export interface ExtendedSparklineDay {
  day: string; // YYYY-MM-DD
  intro: IntroSparklineBuckets;
  survey: SurveyChapterCounts;
  wizard: WizardSparklineBuckets;
  monetize: MonetizeSparklineBuckets;
}

export interface ExtendedSparklineSnapshot {
  days: ExtendedSparklineDay[];
}

// -----------------------------------------------------------------------------
// Phase 2 — extra fixed-key buckets layered on top of ExtendedSparklineDay
// -----------------------------------------------------------------------------

export interface PricingSparklineBuckets {
  paywall_initiated: number;
  price_shown: number;
  begin_checkout: number;
  purchased: number;
}

export interface UxSparklineBuckets {
  rage_click: number;
  scroll_depth_50: number;
  scroll_depth_100: number;
}

export interface PaymentHealthSparklineBuckets {
  refunds: number;
  disputes: number;
  failed: number;
  promo_redemptions: number;
}

/**
 * Viral loop email-match attribution. `partner_completed` and
 * `partner_purchased` are bucketed on the INVITE day so the chart reads
 * "of invites sent today, how many led to partner completions/purchases by
 * the end of the window". Underestimates by definition — only counts when
 * the invitee signs up with the same email they were invited at.
 */
export interface InviteSparklineBuckets {
  sent: number;
  partner_completed: number;
  partner_purchased: number;
}

export interface ExtendedSparklineV3Day extends ExtendedSparklineDay {
  pricing: PricingSparklineBuckets;
  ux: UxSparklineBuckets;
  payment_health: PaymentHealthSparklineBuckets;
  invite: InviteSparklineBuckets;
}

export interface ExtendedSparklineV3Snapshot {
  days: ExtendedSparklineV3Day[];
}

/**
 * Per-source per-day funnel triple. Sources are dynamic (any UTM source
 * value); Node side ranks top-N.
 */
export interface ChannelDayCounts {
  starts: number;
  completions: number;
  purchases: number;
}

export interface ChannelSparklineDay {
  day: string;
  sources: Record<string, ChannelDayCounts>;
}

export interface ChannelSparklineSnapshot {
  days: ChannelSparklineDay[];
}

/**
 * Per-archetype per-day completion + purchase counts. Archetype names follow
 * the V5 scoring engine; falls back to V4 `primary_archetype` when V5 is null.
 */
export interface ArchetypeDayCounts {
  completions: number;
  purchases: number;
}

export interface ArchetypeSparklineDay {
  day: string;
  archetypes: Record<string, ArchetypeDayCounts>;
}

export interface ArchetypeSparklineSnapshot {
  days: ArchetypeSparklineDay[];
}

/**
 * Daily decision-time percentiles (paywall_initiated → succeeded payment).
 * Includes `n` so the renderer can dim or hide low-sample days.
 */
export interface VelocityDay {
  day: string;
  n: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface VelocitySnapshot {
  days: VelocityDay[];
}

/**
 * Top-N abandonment by q_id over the window with a per-day series for each.
 * Returned by the weekly-only `get_question_abandonment_top_n` RPC.
 */
export interface QuestionAbandonmentDay {
  day: string;
  n: number;
}

export interface QuestionAbandonmentRow {
  q_id: string;
  total: number;
  days: QuestionAbandonmentDay[];
}

export interface QuestionAbandonmentSnapshot {
  top_questions: QuestionAbandonmentRow[];
}

/**
 * Ordered array of funnel-edge counts (landing → purchase). The renderer walks
 * the array once, prints stage-kept % vs the previous stage, and flags the
 * single biggest absolute drop with an arrow tag.
 */
export interface DropoffStage {
  name: string;
  count: number;
}

export interface DropoffEverywhereSnapshot {
  stages: DropoffStage[];
}

/**
 * Top 5 (question, answer-option) cohorts whose purchase rate diverges most
 * from the baseline (window-wide completed-survey purchase rate). Sample-size
 * floor (`min_n`, default 10) is enforced in the RPC.
 */
export interface AnswerLiftPair {
  q_id: string;
  q_text: string;
  answer: string;
  n: number;
  paid_n: number;
  rate_pct: number;
  lift_pct: number;
}

export interface AnswerLiftSnapshot {
  baseline_pct: number;
  baseline_n: number;
  baseline_paid: number;
  pairs: AnswerLiftPair[];
}

/**
 * Engagement-bucket purchase rate. Buckets: 0-1m (viewed but no engagement
 * timer fired), 1-5m, 5-10m, 10m+. Only submissions that opened the report
 * are counted — pre-report bounces would dilute the signal.
 */
export interface EngagementBucket {
  bucket: "0-1m" | "1-5m" | "5-10m" | "10m+";
  n: number;
  paid: number;
}

export interface EngagementLiftSnapshot {
  buckets: EngagementBucket[];
}

export interface WeeklyMetrics extends DailyMetrics {
  avgCompletionSec: number;
  funnel: FunnelStages;
  worstChapters: Array<{ sectionId: string; downs: number }>;
  topIssues: Array<{ issue: string; count: number }>;
  dropOff: Array<{ questionIndex: number; abandonCount: number }>;
  /**
   * Strategy-lead weekly-only snapshots. Each is nullable — a single failure
   * is logged + the corresponding section skipped, but the rest of the digest
   * still ships.
   */
  dropoffEverywhere: DropoffEverywhereSnapshot | null;
  answerLift: AnswerLiftSnapshot | null;
  engagementLift: EngagementLiftSnapshot | null;
  /**
   * Pure derivations from the snapshots above. Always present (not nullable)
   * because they're computed in-process after the RPCs resolve — no I/O can
   * fail. Empty arrays when nothing useful to surface (no leaks, no recs).
   */
  leakSeverity: import("@features/admin/server/digest-leak-scoring").LeakSeverity[];
  recommendations: import("@features/admin/server/digest-recommendations").Recommendation[];
  /**
   * Phase 3 loop-closure: classifies last week's recommendations against the
   * current snapshot. Empty array when no history exists (first week of
   * operation) — the Slack section is then omitted.
   */
  revisited: RevisitedEntry[];
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

async function fetchAnalyticsEventCount(
  eventType: string,
  sinceIso: string,
  untilIso: string
): Promise<number> {
  return fetchExactCount(
    `/rest/v1/analytics_event?select=id&event_type=eq.${eventType}&${dateRange("event_time", sinceIso, untilIso)}`
  );
}

/**
 * Counts rows in `funnel_event` for a given event_type in the window.
 *
 * funnel_event.day is a DATE column (UTC day-stamp), not a timestamp, so we
 * slice the ISO timestamps to YYYY-MM-DD. The window is half-open
 * [sinceDay, untilDay) which matches every other fetcher's convention.
 */
async function fetchFunnelEventCount(
  eventType: "unique_visitor" | "survey_engine_mount",
  sinceIso: string,
  untilIso: string
): Promise<number> {
  const sinceDay = sinceIso.slice(0, 10);
  const untilDay = untilIso.slice(0, 10);
  return fetchExactCount(
    `/rest/v1/funnel_event?select=visitor_id&event_type=eq.${eventType}&day=gte.${sinceDay}&day=lt.${untilDay}`
  );
}

/**
 * Returns the earliest `first_seen` timestamp from `funnel_event`, or null when
 * the table is empty or the query fails. Used by the digest renderer to detect
 * partial-day capture windows: if capture began AFTER `sinceIso`, any
 * funnel_event-derived metric in that window is undercounting and the digest
 * must either footnote it or suppress the line.
 *
 * Concretely: when the funnel_event migration ships mid-day, the table only
 * starts collecting from migration-apply time. The first digest run after the
 * migration would compare an inflated 24h survey_starts count against a
 * partial-window unique_visitor count, making visitor < starts (which is
 * logically impossible). This probe lets us recognize that situation.
 *
 * Cheap: PostgREST `order=first_seen.asc&limit=1`, single row scan.
 */
export async function fetchFunnelCaptureStart(): Promise<string | null> {
  try {
    const res = await supabaseFetch(
      `/rest/v1/funnel_event?select=first_seen&order=first_seen.asc&limit=1`
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ first_seen: string | null }>;
    return rows[0]?.first_seen ?? null;
  } catch {
    return null;
  }
}

/**
 * Splits today's unique visitors into NEW (first-ever seen) vs RETURNING
 * (seen on any prior day). Uses the funnel_event table where one row per
 * (visitor_id, day, event_type='unique_visitor') is written by the
 * VisitorPinger client.
 *
 * Both queries are capped to keep page-cap behavior predictable; at prelaunch
 * volume neither approaches the limit.
 */
export async function fetchNewVsReturning(
  sinceIso: string,
  untilIso: string
): Promise<{ newVisitors: number; returningVisitors: number }> {
  const sinceDay = sinceIso.slice(0, 10);
  const untilDay = untilIso.slice(0, 10);
  const [todayRes, priorRes] = await Promise.all([
    supabaseFetch(
      `/rest/v1/funnel_event?select=visitor_id&event_type=eq.unique_visitor&day=gte.${sinceDay}&day=lt.${untilDay}`,
      { headers: { Range: "0-9999" } }
    ),
    supabaseFetch(
      `/rest/v1/funnel_event?select=visitor_id&event_type=eq.unique_visitor&day=lt.${sinceDay}`,
      { headers: { Range: "0-99999" } }
    ),
  ]);

  if (!todayRes.ok) return { newVisitors: 0, returningVisitors: 0 };
  const todayRows = (await todayRes.json()) as Array<{ visitor_id: string }>;
  const todaySet = new Set<string>();
  for (const r of todayRows) if (r.visitor_id) todaySet.add(r.visitor_id);

  let priorSet = new Set<string>();
  if (priorRes.ok) {
    const priorRows = (await priorRes.json()) as Array<{ visitor_id: string }>;
    priorSet = new Set(priorRows.map((r) => r.visitor_id).filter((v): v is string => !!v));
  }

  let returning = 0;
  for (const id of todaySet) if (priorSet.has(id)) returning += 1;
  return { newVisitors: todaySet.size - returning, returningVisitors: returning };
}

/**
 * Top 3 UTC hours that produced the most completed submissions in the window.
 * Helps the strategy lead see when conversions land for ad-scheduling.
 */
export async function fetchHourlyCompletions(
  sinceIso: string,
  untilIso: string,
  limit = 3
): Promise<Array<{ hour: number; count: number }>> {
  const res = await supabaseFetch(
    `/rest/v1/survey_submission?select=created_date_time&status=eq.completed&${dateRange("created_date_time", sinceIso, untilIso)}`,
    { headers: { Range: "0-9999" } }
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ created_date_time: string | null }>;
  const buckets = new Map<number, number>();
  for (const r of rows) {
    if (!r.created_date_time) continue;
    const hour = new Date(r.created_date_time).getUTCHours();
    buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
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

/**
 * Median time-to-purchase in hours: for every successful payment in the window
 * with a corresponding `paywall_initiated` event, compute the gap. Median over
 * the collected gaps. Returns null when the sample is empty (no paywall
 * intent click OR no purchases in the window).
 *
 * Source event swapped from paywall_view to paywall_initiated on 2026-05-24
 * after the founder reframed the metric around user-initiated intent. The
 * label "paywall → purchase" stays — the meaning is now "from first intent
 * click to purchase" instead of "from first modal-shown to purchase", which
 * is the more useful product question.
 *
 * Limited to 1000 payments per window — pre-launch volume is nowhere near.
 */
async function fetchMedianTimeToPurchaseHours(
  sinceIso: string,
  untilIso: string
): Promise<number | null> {
  const paymentsRes = await supabaseFetch(
    `/rest/v1/payment?select=survey_submission_id,created_date_time&status=eq.succeeded&${dateRange("created_date_time", sinceIso, untilIso)}`,
    { headers: { Range: "0-999" } }
  );
  if (!paymentsRes.ok) return null;
  const payments = (await paymentsRes.json()) as Array<{
    survey_submission_id: number | null;
    created_date_time: string;
  }>;
  if (payments.length === 0) return null;

  const submissionIds = [
    ...new Set(payments.map((p) => p.survey_submission_id).filter((v): v is number => v != null)),
  ];
  if (submissionIds.length === 0) return null;

  // Pull the FIRST paywall_initiated per submission in the window — see
  // function-level docstring above for why we use the user-initiated event
  // instead of the historical paywall_view auto-mount signal.
  const idList = submissionIds.join(",");
  const paywallRes = await supabaseFetch(
    `/rest/v1/analytics_event?select=survey_submission_id,event_time&event_type=eq.paywall_initiated&survey_submission_id=in.(${idList})&order=event_time.asc`,
    { headers: { Range: "0-4999" } }
  );
  if (!paywallRes.ok) return null;
  const paywallRows = (await paywallRes.json()) as Array<{
    survey_submission_id: number;
    event_time: string;
  }>;
  const firstPaywallBySubmission = new Map<number, string>();
  for (const row of paywallRows) {
    if (!firstPaywallBySubmission.has(row.survey_submission_id)) {
      firstPaywallBySubmission.set(row.survey_submission_id, row.event_time);
    }
  }

  const gaps: number[] = [];
  for (const payment of payments) {
    if (payment.survey_submission_id == null) continue;
    const paywallTime = firstPaywallBySubmission.get(payment.survey_submission_id);
    if (!paywallTime) continue;
    const gapMs = new Date(payment.created_date_time).getTime() - new Date(paywallTime).getTime();
    if (gapMs > 0) gaps.push(gapMs);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const midIndex = Math.floor(gaps.length / 2);
  // gaps.length > 0 verified above; midIndex is bounded by gaps.length so the
  // non-null assertions are sound. Eslint disable is for the array-index sink.
  const medianMs =
    gaps.length % 2 === 1
      ? // eslint-disable-next-line security/detect-object-injection -- midIndex bounded
        gaps[midIndex]!
      : // eslint-disable-next-line security/detect-object-injection -- midIndex bounded
        (gaps[midIndex - 1]! + gaps[midIndex]!) / 2;
  return Math.round((medianMs / 3_600_000) * 10) / 10; // 1-decimal hours
}

/**
 * Wraps a snapshot builder so a single failure (timeout, transient supabase
 * error) doesn't take down the whole digest. Caller gets null and the section
 * renderer treats null as "skip section."
 */
async function safeSnapshot<T>(label: string, builder: () => Promise<T>): Promise<T | null> {
  try {
    return await builder();
  } catch (err) {
    logger.warn({ err, label }, "digest snapshot failed; skipping section");
    return null;
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
// Strategy-lead RPC fetchers (wizard funnel, drop-off map, answer lift,
// engagement lift, sparklines). Each wraps a single Postgres function call
// from the strategy-funnel-rpcs migration. All five share the same
// null-on-failure contract so the renderer can skip any section without
// crashing the rest of the digest.
// -----------------------------------------------------------------------------

/** POST a single Postgres RPC and parse JSON. Returns null on any failure. */
async function callRpc<T>(name: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await supabaseFetch(`/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      logger.warn({ rpc: name, status: res.status }, "digest RPC non-2xx; skipping section");
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.warn({ err, rpc: name }, "digest RPC threw; skipping section");
    return null;
  }
}

export async function fetchWizardSlideRetention(
  sinceIso: string,
  untilIso: string
): Promise<WizardSlideRetentionSnapshot | null> {
  const raw = await callRpc<Partial<WizardSlideRetentionSnapshot>>("get_wizard_funnel", {
    since_ts: sinceIso,
    until_ts: untilIso,
  });
  if (!raw) return null;
  // Normalize: coerce every slot to a finite non-negative int so the renderer
  // can do arithmetic without re-validating.
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
  };
  return {
    slide1: num(raw.slide1),
    slide2: num(raw.slide2),
    slide3: num(raw.slide3),
    slide4: num(raw.slide4),
    slide5: num(raw.slide5),
    reportViewed: num(raw.reportViewed),
  };
}

export async function fetchSparklines(
  sinceIso: string,
  untilIso: string
): Promise<SparklineSnapshot | null> {
  const raw = await callRpc<{ days?: unknown }>("get_funnel_sparklines", {
    since_ts: sinceIso,
    until_ts: untilIso,
  });
  if (!raw || !Array.isArray(raw.days)) return null;
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
  };
  const days: SparklineDay[] = [];
  for (const row of raw.days) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const day = typeof r.day === "string" ? r.day : "";
    if (!day) continue;
    days.push({
      day,
      visitors: num(r.visitors),
      starts: num(r.starts),
      completions: num(r.completions),
      report_views: num(r.report_views),
      paywall_init: num(r.paywall_init),
      purchases: num(r.purchases),
    });
  }
  return { days };
}

/**
 * Phase-bucketed extended sparklines from `get_funnel_sparklines_v2`. Each row
 * is one UTC day with intro / survey-by-chapter / wizard / monetize buckets.
 * Same null-on-failure contract as the other RPC fetchers — the digest sends
 * fine without it. Defensive: every per-bucket value is coerced to a finite
 * non-negative int so downstream chart code can do arithmetic without
 * re-validating.
 */
export async function fetchExtendedSparklines(
  sinceIso: string,
  untilIso: string
): Promise<ExtendedSparklineSnapshot | null> {
  const raw = await callRpc<{ days?: unknown }>("get_funnel_sparklines_v2", {
    since_ts: sinceIso,
    until_ts: untilIso,
  });
  if (!raw || !Array.isArray(raw.days)) return null;
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
  };
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : {};

  const days: ExtendedSparklineDay[] = [];
  for (const row of raw.days) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const day = typeof r.day === "string" ? r.day : "";
    if (!day) continue;
    const intro = obj(r.intro);
    const wizard = obj(r.wizard);
    const monetize = obj(r.monetize);
    const survey = obj(r.survey);
    const surveyCounts: SurveyChapterCounts = {};
    for (const [key, val] of Object.entries(survey)) {
      // Chapters arrive as zero-padded 2-digit strings from json_object_agg
      // (LEFT(q_id, 2)). Anything else is silently dropped — guards against
      // an upstream schema drift sneaking malformed keys into the digest.
      if (/^[0-9]{2}$/.test(key)) surveyCounts[key] = num(val);
    }
    days.push({
      day,
      intro: {
        s1: num(intro.s1),
        s2: num(intro.s2),
        s3: num(intro.s3),
        s4: num(intro.s4),
      },
      survey: surveyCounts,
      wizard: {
        s1: num(wizard.s1),
        s2: num(wizard.s2),
        s3: num(wizard.s3),
        s4: num(wizard.s4),
        s5: num(wizard.s5),
        s6: num(wizard.s6),
        report_viewed: num(wizard.report_viewed),
      },
      monetize: {
        report_viewed: num(monetize.report_viewed),
        engagement_5min: num(monetize.engagement_5min),
        paywall_init: num(monetize.paywall_init),
        begin_checkout: num(monetize.begin_checkout),
        purchased: num(monetize.purchased),
      },
    });
  }
  return { days };
}

// -----------------------------------------------------------------------------
// Phase 2 fetchers — superset RPC + 3 specialized RPCs (channels / archetypes /
// velocity / question abandonment). All share the null-on-failure +
// num-coerce-everything contract from the v2 fetcher above.
// -----------------------------------------------------------------------------

/** Coerce any field to a finite non-negative int. Shared by all fetchers. */
function coerceNonNegInt(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

/** Coerce to finite non-negative float (for percentile hours). */
function coerceNonNegFloat(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function objOrEmpty(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export async function fetchExtendedSparklinesV3(
  sinceIso: string,
  untilIso: string
): Promise<ExtendedSparklineV3Snapshot | null> {
  const raw = await callRpc<{ days?: unknown }>("get_funnel_sparklines_v3", {
    since_ts: sinceIso,
    until_ts: untilIso,
  });
  if (!raw || !Array.isArray(raw.days)) return null;
  const days: ExtendedSparklineV3Day[] = [];
  for (const row of raw.days) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const day = typeof r.day === "string" ? r.day : "";
    if (!day) continue;
    const intro = objOrEmpty(r.intro);
    const wizard = objOrEmpty(r.wizard);
    const monetize = objOrEmpty(r.monetize);
    const survey = objOrEmpty(r.survey);
    const pricing = objOrEmpty(r.pricing);
    const ux = objOrEmpty(r.ux);
    const paymentHealth = objOrEmpty(r.payment_health);
    const invite = objOrEmpty(r.invite);
    const surveyCounts: SurveyChapterCounts = {};
    for (const [key, val] of Object.entries(survey)) {
      if (/^[0-9]{2}$/.test(key)) surveyCounts[key] = coerceNonNegInt(val);
    }
    days.push({
      day,
      intro: {
        s1: coerceNonNegInt(intro.s1),
        s2: coerceNonNegInt(intro.s2),
        s3: coerceNonNegInt(intro.s3),
        s4: coerceNonNegInt(intro.s4),
      },
      survey: surveyCounts,
      wizard: {
        s1: coerceNonNegInt(wizard.s1),
        s2: coerceNonNegInt(wizard.s2),
        s3: coerceNonNegInt(wizard.s3),
        s4: coerceNonNegInt(wizard.s4),
        s5: coerceNonNegInt(wizard.s5),
        s6: coerceNonNegInt(wizard.s6),
        report_viewed: coerceNonNegInt(wizard.report_viewed),
      },
      monetize: {
        report_viewed: coerceNonNegInt(monetize.report_viewed),
        engagement_5min: coerceNonNegInt(monetize.engagement_5min),
        paywall_init: coerceNonNegInt(monetize.paywall_init),
        begin_checkout: coerceNonNegInt(monetize.begin_checkout),
        purchased: coerceNonNegInt(monetize.purchased),
      },
      pricing: {
        paywall_initiated: coerceNonNegInt(pricing.paywall_initiated),
        price_shown: coerceNonNegInt(pricing.price_shown),
        begin_checkout: coerceNonNegInt(pricing.begin_checkout),
        purchased: coerceNonNegInt(pricing.purchased),
      },
      ux: {
        rage_click: coerceNonNegInt(ux.rage_click),
        scroll_depth_50: coerceNonNegInt(ux.scroll_depth_50),
        scroll_depth_100: coerceNonNegInt(ux.scroll_depth_100),
      },
      payment_health: {
        refunds: coerceNonNegInt(paymentHealth.refunds),
        disputes: coerceNonNegInt(paymentHealth.disputes),
        failed: coerceNonNegInt(paymentHealth.failed),
        promo_redemptions: coerceNonNegInt(paymentHealth.promo_redemptions),
      },
      invite: {
        sent: coerceNonNegInt(invite.sent),
        partner_completed: coerceNonNegInt(invite.partner_completed),
        partner_purchased: coerceNonNegInt(invite.partner_purchased),
      },
    });
  }
  return { days };
}

export async function fetchChannelSparklines(
  sinceIso: string,
  untilIso: string
): Promise<ChannelSparklineSnapshot | null> {
  const raw = await callRpc<{ days?: unknown }>("get_channel_sparklines", {
    since_ts: sinceIso,
    until_ts: untilIso,
  });
  if (!raw || !Array.isArray(raw.days)) return null;
  const days: ChannelSparklineDay[] = [];
  for (const row of raw.days) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const day = typeof r.day === "string" ? r.day : "";
    if (!day) continue;
    const sources: Record<string, ChannelDayCounts> = {};
    const rawSources = objOrEmpty(r.sources);
    for (const [name, val] of Object.entries(rawSources)) {
      // Source names come from a LOWER+TRIM in SQL; still reject empties.
      if (!name || typeof name !== "string") continue;
      const counts = objOrEmpty(val);
      sources[name] = {
        starts: coerceNonNegInt(counts.starts),
        completions: coerceNonNegInt(counts.completions),
        purchases: coerceNonNegInt(counts.purchases),
      };
    }
    days.push({ day, sources });
  }
  return { days };
}

export async function fetchArchetypeSparklines(
  sinceIso: string,
  untilIso: string
): Promise<ArchetypeSparklineSnapshot | null> {
  const raw = await callRpc<{ days?: unknown }>("get_archetype_sparklines", {
    since_ts: sinceIso,
    until_ts: untilIso,
  });
  if (!raw || !Array.isArray(raw.days)) return null;
  const days: ArchetypeSparklineDay[] = [];
  for (const row of raw.days) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const day = typeof r.day === "string" ? r.day : "";
    if (!day) continue;
    const archetypes: Record<string, ArchetypeDayCounts> = {};
    const rawArchetypes = objOrEmpty(r.archetypes);
    for (const [name, val] of Object.entries(rawArchetypes)) {
      if (!name || typeof name !== "string") continue;
      const counts = objOrEmpty(val);
      archetypes[name] = {
        completions: coerceNonNegInt(counts.completions),
        purchases: coerceNonNegInt(counts.purchases),
      };
    }
    days.push({ day, archetypes });
  }
  return { days };
}

export async function fetchVelocityPercentiles(
  sinceIso: string,
  untilIso: string
): Promise<VelocitySnapshot | null> {
  const raw = await callRpc<{ days?: unknown }>("get_velocity_percentiles", {
    since_ts: sinceIso,
    until_ts: untilIso,
  });
  if (!raw || !Array.isArray(raw.days)) return null;
  const days: VelocityDay[] = [];
  for (const row of raw.days) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const day = typeof r.day === "string" ? r.day : "";
    if (!day) continue;
    days.push({
      day,
      n: coerceNonNegInt(r.n),
      p50: coerceNonNegFloat(r.p50),
      p75: coerceNonNegFloat(r.p75),
      p90: coerceNonNegFloat(r.p90),
    });
  }
  return { days };
}

/**
 * Weekly-only — top-N abandoned questions in the window with per-day series.
 * Used by the weekly digest to chart "which screens kill the survey over time".
 */
export async function fetchQuestionAbandonmentTopN(
  sinceIso: string,
  untilIso: string,
  topN = 10
): Promise<QuestionAbandonmentSnapshot | null> {
  const raw = await callRpc<{ top_questions?: unknown }>("get_question_abandonment_top_n", {
    since_ts: sinceIso,
    until_ts: untilIso,
    top_n: topN,
  });
  if (!raw || !Array.isArray(raw.top_questions)) return null;
  const out: QuestionAbandonmentRow[] = [];
  for (const item of raw.top_questions) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const q_id = typeof r.q_id === "string" ? r.q_id : "";
    if (!q_id) continue;
    const total = coerceNonNegInt(r.total);
    const days: QuestionAbandonmentDay[] = [];
    if (Array.isArray(r.days)) {
      for (const d of r.days) {
        if (!d || typeof d !== "object") continue;
        const dr = d as Record<string, unknown>;
        const day = typeof dr.day === "string" ? dr.day : "";
        if (!day) continue;
        days.push({ day, n: coerceNonNegInt(dr.n) });
      }
    }
    out.push({ q_id, total, days });
  }
  return { top_questions: out };
}

export async function fetchDropoffEverywhere(
  sinceIso: string,
  untilIso: string
): Promise<DropoffEverywhereSnapshot | null> {
  const raw = await callRpc<{ stages?: unknown }>("get_dropoff_everywhere", {
    since_ts: sinceIso,
    until_ts: untilIso,
  });
  if (!raw || !Array.isArray(raw.stages)) return null;
  const stages: DropoffStage[] = [];
  for (const item of raw.stages) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name : "";
    const countNum = Number(r.count);
    if (!name || !Number.isFinite(countNum)) continue;
    stages.push({ name, count: Math.max(0, Math.trunc(countNum)) });
  }
  return { stages };
}

export async function fetchAnswerLift(
  sinceIso: string,
  untilIso: string,
  minN = 10
): Promise<AnswerLiftSnapshot | null> {
  const raw = await callRpc<Record<string, unknown>>("get_answer_conversion_lift", {
    since_ts: sinceIso,
    until_ts: untilIso,
    min_n: minN,
  });
  if (!raw) return null;
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const pairs: AnswerLiftPair[] = [];
  if (Array.isArray(raw.pairs)) {
    for (const item of raw.pairs) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const q_id = typeof r.q_id === "string" ? r.q_id : "";
      const q_text = typeof r.q_text === "string" ? r.q_text : "";
      const answer = typeof r.answer === "string" ? r.answer : "";
      if (!q_id || !answer) continue;
      pairs.push({
        q_id,
        q_text,
        answer,
        n: Math.max(0, Math.trunc(num(r.n))),
        paid_n: Math.max(0, Math.trunc(num(r.paid_n))),
        rate_pct: num(r.rate_pct),
        lift_pct: Math.trunc(num(r.lift_pct)),
      });
    }
  }
  return {
    baseline_pct: num(raw.baseline_pct),
    baseline_n: Math.max(0, Math.trunc(num(raw.baseline_n))),
    baseline_paid: Math.max(0, Math.trunc(num(raw.baseline_paid))),
    pairs,
  };
}

export async function fetchEngagementLift(
  sinceIso: string,
  untilIso: string
): Promise<EngagementLiftSnapshot | null> {
  const raw = await callRpc<{ buckets?: unknown }>("get_engagement_purchase_lift", {
    since_ts: sinceIso,
    until_ts: untilIso,
  });
  if (!raw || !Array.isArray(raw.buckets)) return null;
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
  };
  const buckets: EngagementBucket[] = [];
  const valid = new Set(["0-1m", "1-5m", "5-10m", "10m+"]);
  for (const item of raw.buckets) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const bucket = typeof r.bucket === "string" && valid.has(r.bucket) ? r.bucket : null;
    if (!bucket) continue;
    buckets.push({
      bucket: bucket as EngagementBucket["bucket"],
      n: num(r.n),
      paid: num(r.paid),
    });
  }
  return { buckets };
}

// -----------------------------------------------------------------------------
// Funnel + quality fetchers (weekly only)
// -----------------------------------------------------------------------------

export async function fetchFunnelStages(sinceIso: string, untilIso: string): Promise<FunnelStages> {
  const [
    uniqueVisitors,
    engineMounts,
    starts,
    completions,
    reportViewed,
    paywallInitiated,
    purchasedRows,
  ] = await Promise.all([
    fetchFunnelEventCount("unique_visitor", sinceIso, untilIso),
    fetchFunnelEventCount("survey_engine_mount", sinceIso, untilIso),
    fetchSurveyStarts(sinceIso, untilIso),
    fetchCompletions(sinceIso, untilIso),
    fetchDistinctReportViewers(sinceIso, untilIso),
    fetchDistinct(
      `/rest/v1/analytics_event?select=survey_submission_id&event_type=eq.paywall_initiated&${dateRange("event_time", sinceIso, untilIso)}`,
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

  return {
    uniqueVisitors,
    engineMounts,
    starts,
    completions,
    reportViewed,
    paywallInitiated,
    purchased,
  };
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
  // Day-count of the digest window — used to size each snapshot builder so we
  // don't over-fetch 30 days of data when the daily digest only needs 1 day.
  const windowDays = Math.max(
    1,
    Math.round((new Date(untilIso).getTime() - new Date(sinceIso).getTime()) / 86_400_000)
  );

  const [
    uniqueVisitors,
    visitorSplit,
    topCompletionHours,
    surveyEngineMounts,
    surveyStarts,
    completions,
    reportViewers,
    engagement1min,
    engagement5min,
    engagement10min,
    paywallInitiated,
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
    channels,
    leak,
    anomalies,
    monetization,
    medianTimeToPurchaseHours,
    wizardFunnel,
    sparklines,
    extendedSparklines,
    extendedSparklinesV3,
    channels30d,
    archetypes30d,
    velocity30d,
  ] = await Promise.all([
    fetchFunnelEventCount("unique_visitor", sinceIso, untilIso),
    fetchNewVsReturning(sinceIso, untilIso),
    fetchHourlyCompletions(sinceIso, untilIso, 3),
    fetchFunnelEventCount("survey_engine_mount", sinceIso, untilIso),
    fetchSurveyStarts(sinceIso, untilIso),
    fetchCompletions(sinceIso, untilIso),
    fetchDistinctReportViewers(sinceIso, untilIso),
    fetchAnalyticsEventCount("report_engagement_1min", sinceIso, untilIso),
    fetchAnalyticsEventCount("report_engagement_5min", sinceIso, untilIso),
    fetchAnalyticsEventCount("report_engagement_10min", sinceIso, untilIso),
    fetchAnalyticsEventCount("paywall_initiated", sinceIso, untilIso),
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
    // Strategy-lead snapshots — each wrapped in safeSnapshot so one failure
    // doesn't break the digest. windowDays sizes each builder to match the
    // digest window (1 for daily, 7 for weekly).
    safeSnapshot("channelEfficiency", () =>
      buildChannelEfficiencySnapshot(Math.max(windowDays, 7))
    ),
    safeSnapshot("conversionLeak", () =>
      // adminEmail is only used to filter `admin_segment` rows; cron context
      // has no admin so passing empty string returns shared segments only —
      // which is what the digest wants.
      buildConversionLeakDebuggerSnapshot(Math.max(windowDays, 7), "")
    ),
    safeSnapshot("anomalies", () => buildAnomalySnapshot(Math.max(windowDays, 7))),
    safeSnapshot("valueRealization", () => buildValueRealizationSnapshot(Math.max(windowDays, 7))),
    fetchMedianTimeToPurchaseHours(sinceIso, untilIso),
    fetchWizardSlideRetention(sinceIso, untilIso),
    // Sparklines always cover the trailing 30 UTC days ending at the digest
    // window's `untilIso` — so the daily digest gets a 30-day trend regardless
    // of the digest's own 24h or 7d window.
    fetchSparklines(
      new Date(new Date(untilIso).getTime() - 30 * 86_400_000).toISOString(),
      untilIso
    ),
    // Phase-bucketed sparklines (same trailing-30d window) for the four new
    // longitudinal chart images. fetchExtendedSparklines already returns null
    // on RPC failure — renderer treats null as "skip the four image blocks".
    fetchExtendedSparklines(
      new Date(new Date(untilIso).getTime() - 30 * 86_400_000).toISOString(),
      untilIso
    ),
    // Phase 2 — v3 superset (adds pricing/ux/payment_health/invite) plus 3
    // specialized RPCs (channels, archetypes, velocity). Each is null-safe
    // and feeds an independent chart block downstream.
    fetchExtendedSparklinesV3(
      new Date(new Date(untilIso).getTime() - 30 * 86_400_000).toISOString(),
      untilIso
    ),
    fetchChannelSparklines(
      new Date(new Date(untilIso).getTime() - 30 * 86_400_000).toISOString(),
      untilIso
    ),
    fetchArchetypeSparklines(
      new Date(new Date(untilIso).getTime() - 30 * 86_400_000).toISOString(),
      untilIso
    ),
    fetchVelocityPercentiles(
      new Date(new Date(untilIso).getTime() - 30 * 86_400_000).toISOString(),
      untilIso
    ),
  ]);

  const completionRate = surveyStarts > 0 ? Math.round((completions / surveyStarts) * 100) : 0;

  return {
    uniqueVisitors,
    newVisitors: visitorSplit.newVisitors,
    returningVisitors: visitorSplit.returningVisitors,
    surveyEngineMounts,
    surveyStarts,
    completions,
    completionRate,
    topCompletionHours,
    reportViewers,
    engagement1min,
    engagement5min,
    engagement10min,
    paywallInitiated,
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
    channels,
    leak,
    anomalies,
    monetization,
    medianTimeToPurchaseHours,
    wizardFunnel,
    sparklines,
    extendedSparklines,
    extendedSparklinesV3,
    channelSparklines: channels30d,
    archetypeSparklines: archetypes30d,
    velocitySparklines: velocity30d,
  };
}

export async function fetchWeeklyMetrics(
  sinceIso: string,
  untilIso: string
): Promise<WeeklyMetrics> {
  const [
    daily,
    avgCompletionMs,
    funnel,
    worstChapters,
    topIssues,
    dropOff,
    dropoffEverywhere,
    answerLift,
    engagementLift,
  ] = await Promise.all([
    fetchDailyMetrics(sinceIso, untilIso),
    fetchAvgCompletionMs(sinceIso, untilIso),
    fetchFunnelStages(sinceIso, untilIso),
    fetchWorstRatedChapters(sinceIso, untilIso, 3),
    fetchTopIssueCategories(sinceIso, untilIso, 3),
    fetchDropOffQuestions(sinceIso, untilIso, 3),
    fetchDropoffEverywhere(sinceIso, untilIso),
    fetchAnswerLift(sinceIso, untilIso),
    fetchEngagementLift(sinceIso, untilIso),
  ]);

  // For the weekly view we want top-5 (not top-3) of archetypes + UTM.
  const [topArchetypesFive, topUtmSourcesFive] = await Promise.all([
    fetchTopArchetypes(sinceIso, untilIso, 5),
    fetchTopUtmSources(sinceIso, untilIso, 5),
  ]);

  // Build the assembled snapshot up-front (leakSeverity needs it; recs need
  // leakSeverity to fire the dropoff_revenue_loss rule).
  const assembled: WeeklyMetrics = {
    ...daily,
    topArchetypes: topArchetypesFive,
    topUtmSources: topUtmSourcesFive,
    avgCompletionSec: Math.round(avgCompletionMs / 1000),
    funnel,
    worstChapters,
    topIssues,
    dropOff,
    dropoffEverywhere,
    answerLift,
    engagementLift,
    leakSeverity: [],
    recommendations: [],
    revisited: [],
  };
  assembled.leakSeverity = scoreFunnelLeaks(dropoffEverywhere, daily.revenue);
  assembled.recommendations = buildRecommendations(assembled);
  // Loop-closure: pull last 4 weeks of persisted recs and compare against
  // this week's. Fail-soft — fetcher returns [] on any error, classify
  // handles empty history gracefully. currentWeekKey lets classifyRevisited
  // drop any same-week history rows (left over from a same-Monday cron retry)
  // so we never self-compare current recs against their own persistence.
  const history = await fetchRecommendationHistory(4);
  const currentWeekKey = isoWeekString(new Date(sinceIso));
  assembled.revisited = classifyRevisited(history, assembled.recommendations, currentWeekKey);
  return assembled;
}
