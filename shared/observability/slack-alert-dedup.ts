import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { notifySlack } from "@shared/observability/slack";

/**
 * Atomically claim a Slack alert slot for (kind, entityType, entityId).
 *
 * Two-phase commit pattern (migrated 2026-05-24):
 *   1. tryClaimSlackAlert  → INSERT with delivered=false, or UPDATE-reclaim
 *      a stale undelivered row (>10 min old). Returns true iff this caller
 *      has the claim.
 *   2. (caller does the work: fetch metrics, format, send notifySlack)
 *   3. markSlackAlertDelivered  → flip delivered=true so the slot is locked.
 *
 * Crash-safety: if step 2 throws (e.g. Supabase timeout, see 2026-05-24
 * 09:00 UTC funnel-digest failure), the claim row stays delivered=false.
 * The next cron invocation 10+ min later can re-claim and retry the send.
 *
 * Concurrent live invocations are still blocked because the WHERE on
 * UPDATE only matches stale rows.
 */
export async function tryClaimSlackAlert(
  kind: string,
  entityType: string,
  entityId: string
): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.warn({ kind, entityType, entityId }, "tryClaimSlackAlert: supabase not configured");
    return false;
  }

  try {
    const response = await fetchWithTimeout(`${url}/rest/v1/rpc/claim_slack_alert`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_kind: kind,
        p_entity_type: entityType,
        p_entity_id: entityId,
      }),
      timeoutMs: 5000,
    });

    if (!response.ok) {
      logger.warn(
        { kind, entityType, entityId, status: response.status },
        "tryClaimSlackAlert: RPC non-2xx"
      );
      return false;
    }

    // claim_slack_alert returns a single BOOLEAN.
    const body = await response.json().catch(() => false);
    return body === true;
  } catch (err) {
    logger.warn({ err, kind, entityType, entityId }, "tryClaimSlackAlert: error");
    return false;
  }
}

/**
 * Mark a previously-claimed Slack alert slot as delivered=true. Call this
 * AFTER `notifySlack` succeeds so a crash between claim and delivery doesn't
 * leave the slot permanently locked.
 *
 * Best-effort: a failure here just means the row stays delivered=false. The
 * next eligible invocation (10+ min later) will see a stale row and re-claim,
 * potentially causing a duplicate Slack post — acceptable trade-off vs.
 * permanently silenced alerts. Returns void.
 */
export async function markSlackAlertDelivered(
  kind: string,
  entityType: string,
  entityId: string
): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    const response = await fetchWithTimeout(`${url}/rest/v1/rpc/mark_slack_alert_delivered`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_kind: kind,
        p_entity_type: entityType,
        p_entity_id: entityId,
      }),
      timeoutMs: 5000,
    });
    if (!response.ok) {
      logger.warn(
        { kind, entityType, entityId, status: response.status },
        "markSlackAlertDelivered: RPC non-2xx"
      );
    }
  } catch (err) {
    logger.warn({ err, kind, entityType, entityId }, "markSlackAlertDelivered: error");
  }
}

/**
 * Lightweight cron-duration tracker. Call at the start with the cron name +
 * maxDurationSec, await the returned function before returning the response.
 * If the elapsed wall-time exceeds 80% of the budget, fires a single ops
 * Slack ping so a creeping cron slowdown surfaces before it becomes a
 * Vercel timeout 500.
 *
 *   const trackDuration = startCronTimer("nurture-sequence", 60);
 *   // ... do work ...
 *   await trackDuration();
 *   return NextResponse.json({ ok: true });
 *
 * Deduped per (cron, UTC hour) so a sustained slow window doesn't ping every
 * 30 minutes — once an hour is plenty.
 */
export function startCronTimer(cronName: string, maxDurationSec: number): () => Promise<void> {
  const startMs = Date.now();
  const budgetMs = maxDurationSec * 1000;
  const threshold = budgetMs * 0.8;
  return async () => {
    const elapsedMs = Date.now() - startMs;
    if (elapsedMs < threshold) return;
    const hourKey = `${cronName}:${new Date(startMs).toISOString().slice(0, 13)}`;
    const claimed = await tryClaimSlackAlert("cron_slow", "cron_hour", hourKey);
    if (!claimed) return;
    const pct = Math.round((elapsedMs / budgetMs) * 100);
    await notifySlack({
      channel: "ops",
      kind: "cron_slow",
      text: `:warning: Cron *${cronName}* used ${pct}% of its ${maxDurationSec}s budget (${Math.round(elapsedMs / 1000)}s). Approaching timeout — investigate slowness.`,
      username: "ops_alerts",
    });
    await markSlackAlertDelivered("cron_slow", "cron_hour", hourKey);
  };
}

/**
 * Records one row in the `cron_run` history table. Called from every cron's
 * finally block so tech-digest can compute real success-rate + p95-duration
 * metrics. Best-effort: a Supabase outage logs a warn but never throws so
 * the cron itself completes normally.
 *
 *   const startMs = Date.now();
 *   try { ... } catch (err) { error = err; throw; }
 *   finally { await recordCronRun("nurture-sequence", startMs, error ? "error" : "success", errMsg); }
 */
export async function recordCronRun(
  cronName: string,
  startedAtMs: number,
  status: "success" | "error" | "timeout",
  errorMessage?: string
): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.warn({ cronName }, "recordCronRun: supabase not configured");
    return;
  }
  const durationMs = Date.now() - startedAtMs;
  const startedAt = new Date(startedAtMs).toISOString();
  const completedAt = new Date().toISOString();
  try {
    const response = await fetchWithTimeout(`${url}/rest/v1/cron_run`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        cron_name: cronName,
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: durationMs,
        status,
        ...(errorMessage ? { error_message: errorMessage.slice(0, 1000) } : {}),
      }),
      timeoutMs: 5000,
    });
    if (!response.ok) {
      logger.warn(
        { cronName, status, durationMs, httpStatus: response.status },
        "recordCronRun: insert failed"
      );
    }
  } catch (err) {
    logger.warn({ err, cronName, status, durationMs }, "recordCronRun: error");
  }
}

/**
 * Constant-time bearer-token check for cron routes. All four detector crons
 * share this so the auth pattern stays uniform.
 */
export function verifyCronAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < provided.length; i++) {
    result |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}
