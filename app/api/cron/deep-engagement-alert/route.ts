/**
 * GET /api/cron/deep-engagement-alert
 *
 * Every 4 hours, two branches against analytics_event:
 *
 *   1. **deep_engagement_no_convert** — submissions that fired
 *      report_engagement_10min but never paywall_unlocked. The warmest
 *      non-buyers; surface them so we can study what blocks conversion.
 *
 *   2. **paywall_view_burst** — submissions that initiated the paywall
 *      (user click) 5+ times in the last hour without purchasing. Strong
 *      price-objection signal. (Source switched from paywall_view to
 *      paywall_initiated on 2026-05-24; alert kind name kept for dedup
 *      back-compat.)
 *
 * Both branches dedup via slack_alert_sent so each submission pings only
 * once per signal-type.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker } from "@shared/http/circuit-breaker";
import logger from "@shared/observability/logger";
import { notifySlack } from "@shared/observability/slack";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  markSlackAlertDelivered,
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 50;

const SCAN_LIMIT = 200;
const PAYWALL_BURST_THRESHOLD = 5;

async function supabaseFetch(path: string, init?: RequestInit) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("supabase_not_configured");
  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      timeoutMs: 8000,
    })
  );
}

async function scanDeepEngagementNoConvert(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const tenMinRes = await supabaseFetch(
    `/rest/v1/analytics_event?event_type=eq.report_engagement_10min&event_time=gte.${encodeURIComponent(since)}&select=survey_submission_id&order=event_time.desc&limit=${SCAN_LIMIT}`
  );
  if (!tenMinRes.ok) throw new Error(`scan_10min_failed:${tenMinRes.status}`);
  const submissionIds = Array.from(
    new Set(
      ((await tenMinRes.json()) as Array<{ survey_submission_id: number | null }>)
        .map((r) => r.survey_submission_id)
        .filter((id): id is number => !!id)
    )
  );
  if (submissionIds.length === 0) return 0;

  const unlockedRes = await supabaseFetch(
    // eslint-disable-next-line no-secrets/no-secrets -- REST URL, not a credential
    `/rest/v1/analytics_event?event_type=eq.paywall_unlocked&survey_submission_id=in.(${submissionIds.join(",")})&select=survey_submission_id`
  );
  if (!unlockedRes.ok) throw new Error(`scan_unlocked_failed:${unlockedRes.status}`);
  const unlocked = new Set(
    ((await unlockedRes.json()) as Array<{ survey_submission_id: number }>).map(
      (r) => r.survey_submission_id
    )
  );

  const pendingPings: Promise<void>[] = [];
  for (const submissionId of submissionIds) {
    if (unlocked.has(submissionId)) continue;
    const entityId = String(submissionId);
    const claimed = await tryClaimSlackAlert(
      "deep_engagement_no_convert",
      "survey_submission",
      entityId
    );
    if (!claimed) continue;
    pendingPings.push(
      notifySlack({
        channel: "ops",
        kind: "deep_engagement_no_convert",
        text: `:warning: Deep engagement, no purchase — submission #${submissionId} crossed 10min on /report but didn't unlock`,
        username: "ops_alerts",
      }).then(() =>
        markSlackAlertDelivered("deep_engagement_no_convert", "survey_submission", entityId)
      )
    );
  }
  await Promise.allSettled(pendingPings);
  return pendingPings.length;
}

async function scanPaywallViewBursts(): Promise<number> {
  // Detects 5+ user-initiated paywall surfaces from the same submission in
  // an hour without a purchase — strong price-objection signal. Source
  // switched from `paywall_view` to `paywall_initiated` on 2026-05-24 when
  // the founder reframed the metric around user-clicked intent (auto-mount
  // surfaces no longer fire paywall_view). Dedup `kind` kept as
  // `paywall_view_burst` so historical slack_alert_sent rows still dedupe.
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const res = await supabaseFetch(
    `/rest/v1/analytics_event?event_type=eq.paywall_initiated&event_time=gte.${encodeURIComponent(since)}&select=survey_submission_id&limit=${SCAN_LIMIT * 5}`
  );
  if (!res.ok) throw new Error(`scan_paywall_initiated_failed:${res.status}`);
  const rows = (await res.json()) as Array<{ survey_submission_id: number | null }>;
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.survey_submission_id == null) continue;
    counts.set(r.survey_submission_id, (counts.get(r.survey_submission_id) ?? 0) + 1);
  }

  const burstCandidates = Array.from(counts.entries())
    .filter(([, n]) => n >= PAYWALL_BURST_THRESHOLD)
    .map(([id, n]) => ({ submissionId: id, clicks: n }));

  if (burstCandidates.length === 0) return 0;

  // Exclude those who already unlocked.
  const ids = burstCandidates.map((c) => c.submissionId);
  const unlockedRes = await supabaseFetch(
    // eslint-disable-next-line no-secrets/no-secrets -- REST URL, not a credential
    `/rest/v1/analytics_event?event_type=eq.paywall_unlocked&survey_submission_id=in.(${ids.join(",")})&select=survey_submission_id`
  );
  const unlocked = unlockedRes.ok
    ? new Set(
        ((await unlockedRes.json()) as Array<{ survey_submission_id: number }>).map(
          (r) => r.survey_submission_id
        )
      )
    : new Set<number>();

  const pendingPings: Promise<void>[] = [];
  for (const { submissionId, clicks } of burstCandidates) {
    if (unlocked.has(submissionId)) continue;
    const entityId = String(submissionId);
    const claimed = await tryClaimSlackAlert("paywall_view_burst", "survey_submission", entityId);
    if (!claimed) continue;
    pendingPings.push(
      notifySlack({
        channel: "ops",
        kind: "paywall_view_burst",
        text: `:vertical_traffic_light: Paywall click burst — submission #${submissionId} initiated the paywall ${clicks}× in the last hour, no purchase`,
        username: "ops_alerts",
      }).then(() => markSlackAlertDelivered("paywall_view_burst", "survey_submission", entityId))
    );
  }
  await Promise.allSettled(pendingPings);
  return pendingPings.length;
}

/**
 * E1: real-time survey drop-off spike. If a single `question_index` sees
 * 10+ abandons in the last hour, ping ops so a content regression on that
 * question becomes visible within hours instead of waiting for Monday's
 * weekly digest. Dedup per (question_index, UTC hour) so a sustained
 * issue alerts once per hour.
 */
const DROPOFF_SPIKE_THRESHOLD = 10;
async function scanSurveyDropOffSpikes(): Promise<number> {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const res = await supabaseFetch(
    `/rest/v1/survey_behavior_event?select=question_index&direction=eq.abandon&event_time=gte.${encodeURIComponent(since)}&limit=5000`
  );
  if (!res.ok) return 0;
  const rows = (await res.json()) as Array<{ question_index: number | null }>;
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.question_index == null) continue;
    counts.set(r.question_index, (counts.get(r.question_index) ?? 0) + 1);
  }
  const spikes = [...counts.entries()].filter(([, n]) => n >= DROPOFF_SPIKE_THRESHOLD);
  if (spikes.length === 0) return 0;

  const hourKey = new Date().toISOString().slice(0, 13);
  const pendingPings: Promise<void>[] = [];
  for (const [questionIndex, n] of spikes) {
    const entityId = `${questionIndex}:${hourKey}`;
    const claimed = await tryClaimSlackAlert("survey_dropoff_spike", "question_hour", entityId);
    if (!claimed) continue;
    pendingPings.push(
      notifySlack({
        channel: "ops",
        kind: "survey_dropoff_spike",
        text: `:fast_forward: Survey drop-off spike — Q${questionIndex} had ${n} abandons in the last hour. Investigate the question content or a regression.`,
        username: "ops_alerts",
      }).then(() => markSlackAlertDelivered("survey_dropoff_spike", "question_hour", entityId))
    );
  }
  await Promise.allSettled(pendingPings);
  return pendingPings.length;
}

/**
 * E2: viral report detector. A `personal_report` with 5+ active shares OR
 * 20+ cumulative views in the last 24h is exhibiting organic spread —
 * worth surfacing so the team knows to study what made it shareable.
 * Dedup per personal_report_id forever (one ping per viral report).
 */
const SHARE_COUNT_THRESHOLD = 5;
const VIEW_COUNT_THRESHOLD = 20;
async function scanViralReports(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  // Two queries (created OR viewed in window) — avoids PostgREST `or=()`
  // syntax which is finicky when the value contains URL-special chars
  // like the ISO timestamp colon. Each query is independent; we dedupe
  // by report_share.id in app.
  type ShareRow = {
    id: number;
    personal_report_id: number | null;
    view_count: number | null;
  };
  const [createdRes, viewedRes] = await Promise.all([
    supabaseFetch(
      `/rest/v1/report_share?select=id,personal_report_id,view_count&revoked_at=is.null&created_at=gte.${encodeURIComponent(since)}&limit=5000`
    ),
    supabaseFetch(
      `/rest/v1/report_share?select=id,personal_report_id,view_count&revoked_at=is.null&last_viewed_at=gte.${encodeURIComponent(since)}&limit=5000`
    ),
  ]);
  if (!createdRes.ok && !viewedRes.ok) return 0;
  const collected: ShareRow[] = [];
  if (createdRes.ok) collected.push(...((await createdRes.json()) as ShareRow[]));
  if (viewedRes.ok) collected.push(...((await viewedRes.json()) as ShareRow[]));

  // Aggregate by personal_report_id. Dedup by row id so a share that
  // appears in both queries (created AND viewed in the window) counts
  // once. Earlier draft used (report_id, view_count) which collapsed
  // distinct rows with the same view_count.
  const seenShareIds = new Set<number>();
  const byReport = new Map<number, { shares: number; views: number }>();
  for (const r of collected) {
    if (r.personal_report_id == null) continue;
    if (seenShareIds.has(r.id)) continue;
    seenShareIds.add(r.id);

    const agg = byReport.get(r.personal_report_id) ?? { shares: 0, views: 0 };
    agg.shares += 1;
    agg.views += typeof r.view_count === "number" ? r.view_count : 0;
    byReport.set(r.personal_report_id, agg);
  }
  const viral = [...byReport.entries()].filter(
    ([, a]) => a.shares >= SHARE_COUNT_THRESHOLD || a.views >= VIEW_COUNT_THRESHOLD
  );
  if (viral.length === 0) return 0;

  const pendingPings: Promise<void>[] = [];
  for (const [reportId, { shares, views }] of viral) {
    const entityId = String(reportId);
    const claimed = await tryClaimSlackAlert("viral_report", "personal_report", entityId);
    if (!claimed) continue;
    pendingPings.push(
      notifySlack({
        channel: "ops",
        kind: "viral_report",
        text: `:fire: Viral report — personal_report #${reportId} has *${shares} active shares* and *${views} total views* in the last 24h.`,
        username: "ops_alerts",
      }).then(() => markSlackAlertDelivered("viral_report", "personal_report", entityId))
    );
  }
  await Promise.allSettled(pendingPings);
  return pendingPings.length;
}

/**
 * E5: same-IP submission flood. 3+ completed `survey_submission` rows
 * from the same `client_ip` in the last hour is a strong bot signal.
 * Dedup per (ip, UTC hour) so one IP campaign alerts once per hour.
 */
const SAME_IP_FLOOD_THRESHOLD = 3;
async function scanSameIpFlood(): Promise<number> {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  // survey_submission doesn't have client_ip; survey_partial_save does.
  // The completed-survey filter is implicit via status=completed; pair
  // partial-save's client_ip with the submission via session_id.
  const res = await supabaseFetch(
    `/rest/v1/survey_partial_save?select=client_ip&saved_at=gte.${encodeURIComponent(since)}&client_ip=not.is.null&limit=5000`
  );
  if (!res.ok) return 0;
  const rows = (await res.json()) as Array<{ client_ip: string | null }>;
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.client_ip) continue;
    counts.set(r.client_ip, (counts.get(r.client_ip) ?? 0) + 1);
  }
  const floods = [...counts.entries()].filter(([, n]) => n >= SAME_IP_FLOOD_THRESHOLD);
  if (floods.length === 0) return 0;

  const hourKey = new Date().toISOString().slice(0, 13);
  const pendingPings: Promise<void>[] = [];
  for (const [ip, n] of floods) {
    const entityId = `${ip}:${hourKey}`;
    const claimed = await tryClaimSlackAlert("same_ip_flood", "ip_hour", entityId);
    if (!claimed) continue;
    pendingPings.push(
      notifySlack({
        channel: "ops",
        kind: "same_ip_flood",
        text: `:rotating_light: Same-IP flood — IP \`${ip}\` has ${n} active survey sessions in the last hour. Likely abuse.`,
        username: "ops_alerts",
      }).then(() => markSlackAlertDelivered("same_ip_flood", "ip_hour", entityId))
    );
  }
  await Promise.allSettled(pendingPings);
  return pendingPings.length;
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Skip on the staging Vercel project (shares the prod DB).
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  const trackDuration = startCronTimer("deep-engagement-alert", 50);
  const startMs = Date.now();
  let cronError: string | undefined;
  try {
    const [deepPings, burstPings, dropoffPings, viralPings, floodPings] = await Promise.all([
      scanDeepEngagementNoConvert(),
      scanPaywallViewBursts(),
      scanSurveyDropOffSpikes(),
      scanViralReports(),
      scanSameIpFlood(),
    ]);
    return NextResponse.json({
      deepPings,
      burstPings,
      dropoffPings,
      viralPings,
      floodPings,
    });
  } catch (err) {
    logger.error({ err }, "deep-engagement-alert cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun(
      "deep-engagement-alert",
      startMs,
      cronError ? "error" : "success",
      cronError
    );
  }
}
