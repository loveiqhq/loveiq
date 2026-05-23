/**
 * Product-lead daily digest metrics. Fired by /api/cron/product-digest.
 *
 * Six fetchers, each returning a small typed snapshot. The orchestrator
 * `fetchProductMetrics` runs them all in Promise.all and renders into one
 * Slack message via formatProductDigest in the cron route.
 *
 * Every fetcher is best-effort: returns an empty/null shape on failure so a
 * single broken query never breaks the whole digest.
 */

import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface VoiceOfCustomerRow {
  sectionId: string;
  downs: number;
  sampleComment: string | null;
}

export interface VoiceOfCustomerSnapshot {
  topChapters: VoiceOfCustomerRow[];
  totalIssuesWithComment: number;
  topIssueCategories: Array<{ issue: string; count: number }>;
}

export interface DropOffRow {
  questionIndex: number;
  abandonCount: number;
}

export interface PricingTierRow {
  plan: "essentials" | "full_report" | "all_reports";
  quoted: number;
  checkoutStarted: number;
  purchased: number;
  conversionPct: number;
  revenueEur: number;
}

export interface UxQualitySnapshot {
  rageClicks: number;
  scroll25: number;
  scroll50: number;
  scroll75: number;
  scroll100: number;
  // Pct-of-50% — how many of the people who got to 50% then made it to 75/100.
  // Better signal than raw counts: shows whether deep readers convert.
  scroll75ofMidPct: number | null;
  scroll100ofMidPct: number | null;
}

export interface WizardSlideStep {
  fromSlide: number;
  toSlide: number;
  advanced: number;
  // Ratio vs the count of advances at fromSlide-1 (or total starts when fromSlide=0).
  // Null when there's no prior step to compare against (slide 0 has no source).
  retainedPct: number | null;
}

export interface WizardFunnelSnapshot {
  steps: WizardSlideStep[];
  totalForwards: number;
}

export interface OnboardingFunnelSnapshot {
  invitesSent: number;
  sharesOpened: number;
  sharesUnlocked: number;
  // Conversion rates as 0-100.
  openRatePct: number | null;
  unlockRatePct: number | null;
  // Viral K-factor (invites per completion) — surfaced from
  // referral-intelligence.ts's `get_referral_chains` RPC. Null when unavailable.
  viralKFactor: number | null;
}

export interface ResumeBehaviorSnapshot {
  paused: number; // session_ids saved-but-not-yet-submitted in the past 7d
  resumed: number; // of those, how many completed in this digest window
  resumeRatePct: number | null;
}

export interface DeviceMixRow {
  deviceType: string;
  count: number;
  pct: number; // 0-100
}

export interface ProductMetrics {
  voiceOfCustomer: VoiceOfCustomerSnapshot | null;
  dropOff: DropOffRow[];
  pricing: PricingTierRow[];
  uxQuality: UxQualitySnapshot | null;
  wizard: WizardFunnelSnapshot | null;
  onboarding: OnboardingFunnelSnapshot | null;
  resume: ResumeBehaviorSnapshot | null;
  deviceMix: DeviceMixRow[];
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function dateRange(column: string, sinceIso: string, untilIso: string): string {
  return `${column}=gte.${encodeURIComponent(sinceIso)}&${column}=lt.${encodeURIComponent(untilIso)}`;
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

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err, label }, "product-digest fetcher failed");
    return fallback;
  }
}

// -----------------------------------------------------------------------------
// Fetchers
// -----------------------------------------------------------------------------

export async function fetchVoiceOfCustomer(
  sinceIso: string,
  untilIso: string
): Promise<VoiceOfCustomerSnapshot> {
  const res = await supabaseFetch(
    `/rest/v1/report_section_feedback?select=section_id,issue,comment&feedback=eq.down&${dateRange("created_at", sinceIso, untilIso)}`,
    { headers: { Range: "0-999" } }
  );
  if (!res.ok) return { topChapters: [], totalIssuesWithComment: 0, topIssueCategories: [] };
  const rows = (await res.json()) as Array<{
    section_id: string | null;
    issue: string | null;
    comment: string | null;
  }>;

  const byChapter = new Map<string, { downs: number; sampleComment: string | null }>();
  const byIssue = new Map<string, number>();
  let withComment = 0;

  for (const r of rows) {
    if (r.section_id) {
      const slot = byChapter.get(r.section_id) ?? { downs: 0, sampleComment: null };
      slot.downs += 1;
      if (!slot.sampleComment && r.comment && r.comment.trim().length > 0) {
        slot.sampleComment = r.comment.trim().slice(0, 140);
      }
      byChapter.set(r.section_id, slot);
    }
    if (r.issue) byIssue.set(r.issue, (byIssue.get(r.issue) ?? 0) + 1);
    if (r.comment && r.comment.trim().length > 0) withComment += 1;
  }

  const topChapters: VoiceOfCustomerRow[] = [...byChapter.entries()]
    .map(([sectionId, v]) => ({ sectionId, downs: v.downs, sampleComment: v.sampleComment }))
    .sort((a, b) => b.downs - a.downs)
    .slice(0, 3);

  const topIssueCategories = [...byIssue.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { topChapters, totalIssuesWithComment: withComment, topIssueCategories };
}

export async function fetchDailyDropOff(
  sinceIso: string,
  untilIso: string,
  limit = 3
): Promise<DropOffRow[]> {
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

export async function fetchPricingTierConversion(sinceIso: string): Promise<PricingTierRow[]> {
  // The RPC accepts a since timestamp and returns per-segment rows. Aggregate
  // up to the plan level here so the digest shows essentials / full_report /
  // all_reports cleanly without segment cardinality noise.
  const res = await supabaseFetch(`/rest/v1/rpc/get_report_pricing_metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ since_ts: sinceIso, plan_filter: null }),
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  // RPC may return null/error envelope under transient conditions — coerce
  // to empty array so the section silently skips rather than crashing.
  const rows = (Array.isArray(body) ? body : []) as Array<{
    plan: string | null;
    quoted_count: number | string | null;
    checkout_started_count: number | string | null;
    purchased_count: number | string | null;
    revenue_eur: number | string | null;
  }>;

  const PLANS: PricingTierRow["plan"][] = ["essentials", "full_report", "all_reports"];
  const agg = new Map<
    PricingTierRow["plan"],
    { quoted: number; co: number; bought: number; rev: number }
  >();
  for (const plan of PLANS) agg.set(plan, { quoted: 0, co: 0, bought: 0, rev: 0 });

  for (const r of rows) {
    if (!r.plan) continue;
    if (!PLANS.includes(r.plan as PricingTierRow["plan"])) continue;
    const slot = agg.get(r.plan as PricingTierRow["plan"])!;
    slot.quoted += Number(r.quoted_count ?? 0);
    slot.co += Number(r.checkout_started_count ?? 0);
    slot.bought += Number(r.purchased_count ?? 0);
    slot.rev += Number(r.revenue_eur ?? 0);
  }

  return PLANS.map((plan) => {
    const a = agg.get(plan)!;
    const conv = a.quoted > 0 ? (a.bought / a.quoted) * 100 : 0;
    return {
      plan,
      quoted: a.quoted,
      checkoutStarted: a.co,
      purchased: a.bought,
      conversionPct: Math.round(conv * 10) / 10,
      revenueEur: Math.round(a.rev * 100) / 100,
    };
  }).filter((row) => row.quoted > 0); // Hide plans with no quotes — keeps the section clean.
}

export async function fetchUxQuality(
  sinceIso: string,
  untilIso: string
): Promise<UxQualitySnapshot> {
  const eventCount = async (eventType: string): Promise<number> =>
    fetchExactCount(
      `/rest/v1/analytics_event?select=id&event_type=eq.${eventType}&${dateRange("event_time", sinceIso, untilIso)}`
    );

  const [rageClicks, scroll25, scroll50, scroll75, scroll100] = await Promise.all([
    eventCount("rage_click"),
    eventCount("scroll_depth_25"),
    eventCount("scroll_depth_50"),
    eventCount("scroll_depth_75"),
    eventCount("scroll_depth_100"),
  ]);

  // Mid-funnel reading rates: of users who got to 50%, how many made it to
  // 75% / 100%. Null when scroll50=0 to avoid divide-by-zero noise.
  const scroll75ofMidPct = scroll50 > 0 ? Math.round((scroll75 / scroll50) * 1000) / 10 : null;
  const scroll100ofMidPct = scroll50 > 0 ? Math.round((scroll100 / scroll50) * 1000) / 10 : null;

  return {
    rageClicks,
    scroll25,
    scroll50,
    scroll75,
    scroll100,
    scroll75ofMidPct,
    scroll100ofMidPct,
  };
}

export async function fetchWizardFunnel(
  sinceIso: string,
  untilIso: string
): Promise<WizardFunnelSnapshot> {
  // Pull all forward-direction wizard_slide_advanced events in the window.
  // Each row's metadata carries from_slide + to_slide.
  const res = await supabaseFetch(
    `/rest/v1/analytics_event?select=metadata&event_type=eq.wizard_slide_advanced&${dateRange("event_time", sinceIso, untilIso)}`,
    { headers: { Range: "0-4999" } }
  );
  if (!res.ok) return { steps: [], totalForwards: 0 };
  const rows = (await res.json()) as Array<{
    metadata: { from_slide?: number; to_slide?: number; direction?: string } | null;
  }>;

  // Count forward advances per (from_slide -> to_slide) pair. Skip backwards.
  const stepCounts = new Map<string, { from: number; to: number; count: number }>();
  let totalForwards = 0;
  for (const r of rows) {
    const md = r.metadata;
    if (!md || md.direction !== "next") continue;
    if (typeof md.from_slide !== "number" || typeof md.to_slide !== "number") continue;
    totalForwards += 1;
    const key = `${md.from_slide}->${md.to_slide}`;
    const slot = stepCounts.get(key) ?? { from: md.from_slide, to: md.to_slide, count: 0 };
    slot.count += 1;
    stepCounts.set(key, slot);
  }

  // Build the linear funnel: 0->1, 1->2, 2->3, ... Use the lowest from-slide
  // seen as baseline; later step's retention % is its count over the previous
  // step's count (the cohort that made it that far).
  const rawSteps = [...stepCounts.values()].sort((a, b) => a.from - b.from || a.to - b.to);
  const result: WizardSlideStep[] = [];
  let priorCount: number | null = null;
  for (const step of rawSteps) {
    const retainedPct =
      priorCount != null && priorCount > 0
        ? Math.round((step.count / priorCount) * 1000) / 10
        : null;
    result.push({
      fromSlide: step.from,
      toSlide: step.to,
      advanced: step.count,
      retainedPct,
    });
    priorCount = step.count;
  }
  return { steps: result, totalForwards };
}

export async function fetchOnboardingFunnel(
  sinceIso: string,
  untilIso: string
): Promise<OnboardingFunnelSnapshot> {
  // Stage 1: invites sent. invite_event rows in window.
  const invitesSent = await fetchExactCount(
    `/rest/v1/invite_event?select=id&${dateRange("created_at", sinceIso, untilIso)}`
  );

  // Stage 2: shares opened. report_share rows in window with view_count > 0.
  // (Created in-window AND viewed = "share opened" for the day.)
  const sharesOpenedRes = await supabaseFetch(
    `/rest/v1/report_share?select=id&view_count=gt.0&${dateRange("created_at", sinceIso, untilIso)}`,
    { method: "HEAD", headers: { Prefer: "count=exact" } }
  );
  const sharesOpenedRange = sharesOpenedRes.headers.get("content-range");
  const sharesOpened =
    sharesOpenedRange && sharesOpenedRange.split("/")[1] !== "*"
      ? parseInt(sharesOpenedRange.split("/")[1]!, 10)
      : 0;

  // Stage 3: shares that produced unlocks. Approx via payment rows whose
  // pricing_quote_id traces back to a share recipient. Lightweight proxy:
  // count payments succeeded in the window whose `metadata->>'via'` includes
  // 'share'. If that signal isn't set, this collapses to 0 — better than a
  // fake number.
  const unlocksRes = await supabaseFetch(
    `/rest/v1/payment?select=id&status=eq.succeeded&metadata->>via=eq.share&${dateRange("created_date_time", sinceIso, untilIso)}`,
    { method: "HEAD", headers: { Prefer: "count=exact" } }
  );
  const unlocksRange = unlocksRes.headers.get("content-range");
  const sharesUnlocked =
    unlocksRange && unlocksRange.split("/")[1] !== "*"
      ? parseInt(unlocksRange.split("/")[1]!, 10)
      : 0;

  const openRatePct = invitesSent > 0 ? Math.round((sharesOpened / invitesSent) * 1000) / 10 : null;
  const unlockRatePct =
    sharesOpened > 0 ? Math.round((sharesUnlocked / sharesOpened) * 1000) / 10 : null;

  // Viral K-factor — call get_referral_chains RPC and read viral_coefficient.
  // Wrapped so a missing/erroring RPC just sets the field to null.
  let viralKFactor: number | null = null;
  try {
    const rpcRes = await supabaseFetch("/rest/v1/rpc/get_referral_chains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since_ts: sinceIso }),
    });
    if (rpcRes.ok) {
      const body = await rpcRes.json().catch(() => null);
      const candidate =
        body && typeof body === "object" && "viral_coefficient" in body
          ? (body as { viral_coefficient: unknown }).viral_coefficient
          : null;
      const n = Number(candidate);
      if (Number.isFinite(n) && n >= 0) viralKFactor = Math.round(n * 100) / 100;
    }
  } catch {
    // Best-effort — viralKFactor stays null.
  }

  return {
    invitesSent,
    sharesOpened,
    sharesUnlocked,
    openRatePct,
    unlockRatePct,
    viralKFactor,
  };
}

/**
 * Resume rate: of users who paused in the past 7 days (created a partial save
 * row whose session_id never produced a survey_submission yet), how many
 * completed in the current window? Tells product if "save & continue later"
 * UX actually works.
 *
 * The 7-day backlook is a hard ceiling — older partial saves expire / age out.
 */
export async function fetchResumeRate(
  sinceIso: string,
  untilIso: string
): Promise<ResumeBehaviorSnapshot> {
  const sevenDaysBefore = new Date(new Date(sinceIso).getTime() - 7 * 86_400_000).toISOString();

  // Eligible cohort: partial saves started in [since-7d, since).
  const partialRes = await supabaseFetch(
    `/rest/v1/survey_partial_save?select=session_id&started_at=gte.${encodeURIComponent(sevenDaysBefore)}&started_at=lt.${encodeURIComponent(sinceIso)}`,
    { headers: { Range: "0-9999" } }
  );
  if (!partialRes.ok) return { paused: 0, resumed: 0, resumeRatePct: null };
  const partialRows = (await partialRes.json()) as Array<{ session_id: string | null }>;
  const pausedSessions = new Set<string>();
  for (const r of partialRows) if (r.session_id) pausedSessions.add(r.session_id);

  if (pausedSessions.size === 0) return { paused: 0, resumed: 0, resumeRatePct: null };

  // Completed-in-window cohort joined against eligible session_ids.
  const completedRes = await supabaseFetch(
    `/rest/v1/survey_submission?select=session_id&status=eq.completed&${dateRange("created_date_time", sinceIso, untilIso)}`,
    { headers: { Range: "0-4999" } }
  );
  let resumed = 0;
  if (completedRes.ok) {
    const completedRows = (await completedRes.json()) as Array<{
      session_id: string | null;
    }>;
    for (const r of completedRows) {
      if (r.session_id && pausedSessions.has(r.session_id)) resumed += 1;
    }
  }

  return {
    paused: pausedSessions.size,
    resumed,
    resumeRatePct: Math.round((resumed / pausedSessions.size) * 1000) / 10,
  };
}

/**
 * Device mix at the paywall, sourced from `report_price_quote.device_type`.
 * Returns rows ordered by count desc with a percentage of total quoted users.
 */
export async function fetchDeviceMix(sinceIso: string, untilIso: string): Promise<DeviceMixRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/report_price_quote?select=device_type&${dateRange("created_date_time", sinceIso, untilIso)}`,
    { headers: { Range: "0-4999" } }
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ device_type: string | null }>;
  if (rows.length === 0) return [];
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const dev = (r.device_type ?? "unknown").trim() || "unknown";
    counts.set(dev, (counts.get(dev) ?? 0) + 1);
    total += 1;
  }
  return [...counts.entries()]
    .map(([deviceType, count]) => ({
      deviceType,
      count,
      pct: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);
}

// -----------------------------------------------------------------------------
// Orchestrator
// -----------------------------------------------------------------------------

export async function fetchProductMetrics(
  sinceIso: string,
  untilIso: string
): Promise<ProductMetrics> {
  const [voiceOfCustomer, dropOff, pricing, uxQuality, wizard, onboarding, resume, deviceMix] =
    await Promise.all([
      safe<VoiceOfCustomerSnapshot | null>(
        "voiceOfCustomer",
        () => fetchVoiceOfCustomer(sinceIso, untilIso),
        null
      ),
      safe<DropOffRow[]>("dropOff", () => fetchDailyDropOff(sinceIso, untilIso), []),
      safe<PricingTierRow[]>("pricing", () => fetchPricingTierConversion(sinceIso), []),
      safe<UxQualitySnapshot | null>("uxQuality", () => fetchUxQuality(sinceIso, untilIso), null),
      safe<WizardFunnelSnapshot | null>(
        "wizard",
        () => fetchWizardFunnel(sinceIso, untilIso),
        null
      ),
      safe<OnboardingFunnelSnapshot | null>(
        "onboarding",
        () => fetchOnboardingFunnel(sinceIso, untilIso),
        null
      ),
      safe<ResumeBehaviorSnapshot | null>(
        "resume",
        () => fetchResumeRate(sinceIso, untilIso),
        null
      ),
      safe<DeviceMixRow[]>("deviceMix", () => fetchDeviceMix(sinceIso, untilIso), []),
    ]);

  return {
    voiceOfCustomer,
    dropOff,
    pricing,
    uxQuality,
    wizard,
    onboarding,
    resume,
    deviceMix,
  };
}
