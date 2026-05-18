/**
 * GET /api/cron/deep-engagement-alert
 *
 * Every 4 hours, two branches against analytics_event:
 *
 *   1. **deep_engagement_no_convert** — submissions that fired
 *      report_engagement_10min but never paywall_unlocked. The warmest
 *      non-buyers; surface them so we can study what blocks conversion.
 *
 *   2. **paywall_view_burst** — submissions that opened the paywall modal
 *      5+ times in the last hour without purchasing. Strong price-objection
 *      signal.
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
import { tryClaimSlackAlert, verifyCronAuth } from "@shared/observability/slack-alert-dedup";

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

  let pinged = 0;
  for (const submissionId of submissionIds) {
    if (unlocked.has(submissionId)) continue;
    const claimed = await tryClaimSlackAlert(
      "deep_engagement_no_convert",
      "survey_submission",
      String(submissionId)
    );
    if (!claimed) continue;
    void notifySlack({
      channel: "ops",
      kind: "deep_engagement_no_convert",
      text: `:warning: Deep engagement, no purchase — submission #${submissionId} crossed 10min on /report but didn't unlock`,
      username: "ops_alerts",
    });
    pinged += 1;
  }
  return pinged;
}

async function scanPaywallViewBursts(): Promise<number> {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const res = await supabaseFetch(
    `/rest/v1/analytics_event?event_type=eq.paywall_view&event_time=gte.${encodeURIComponent(since)}&select=survey_submission_id&limit=${SCAN_LIMIT * 5}`
  );
  if (!res.ok) throw new Error(`scan_paywall_views_failed:${res.status}`);
  const rows = (await res.json()) as Array<{ survey_submission_id: number | null }>;
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.survey_submission_id == null) continue;
    counts.set(r.survey_submission_id, (counts.get(r.survey_submission_id) ?? 0) + 1);
  }

  const burstCandidates = Array.from(counts.entries())
    .filter(([, n]) => n >= PAYWALL_BURST_THRESHOLD)
    .map(([id, n]) => ({ submissionId: id, views: n }));

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

  let pinged = 0;
  for (const { submissionId, views } of burstCandidates) {
    if (unlocked.has(submissionId)) continue;
    const claimed = await tryClaimSlackAlert(
      "paywall_view_burst",
      "survey_submission",
      String(submissionId)
    );
    if (!claimed) continue;
    void notifySlack({
      channel: "ops",
      kind: "paywall_view_burst",
      text: `:vertical_traffic_light: Paywall view burst — submission #${submissionId} hit the paywall ${views}× in the last hour, no purchase`,
      username: "ops_alerts",
    });
    pinged += 1;
  }
  return pinged;
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [deepPings, burstPings] = await Promise.all([
      scanDeepEngagementNoConvert(),
      scanPaywallViewBursts(),
    ]);
    return NextResponse.json({ deepPings, burstPings });
  } catch (err) {
    logger.error({ err }, "deep-engagement-alert cron failed");
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}
