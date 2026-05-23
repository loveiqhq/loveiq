/**
 * Tech-lead daily digest metrics. Fired by /api/cron/tech-digest.
 *
 * Five fetchers covering: service health, stuck payments, webhook intake,
 * cron alerts, and security signals. Each returns a small typed snapshot.
 * `fetchTechMetrics` runs them in Promise.all with per-call try/catch so a
 * single failure doesn't break the digest.
 */

import { Redis } from "@upstash/redis";
import { supabaseFetch } from "@features/admin/server/supabase";
import {
  buildHealthStatusSnapshot,
  type AdminHealthServiceStatus,
} from "@features/admin/server/health";
import logger from "@shared/observability/logger";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ServiceHealthLine {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  detail: string;
}

export interface ServiceHealthSnapshot {
  overall: "healthy" | "degraded" | "down";
  lines: ServiceHealthLine[];
}

export interface StuckPaymentsSnapshot {
  count: number;
  // First few IDs to assist debugging — the full list is in /admin.
  sampleIds: number[];
}

export interface WebhookIntakeRow {
  eventType: string;
  count: number;
}

export interface WebhookIntakeSnapshot {
  stripeTotal: number;
  stripeProcessed: number;
  stripeErrors: number;
  stripeTopEvents: WebhookIntakeRow[];
  resendOpened: number;
  resendClicked: number;
}

export interface CronStatsRow {
  cronName: string;
  runs: number;
  errors: number;
  avgMs: number;
  p95Ms: number;
}

export interface CronHealthSnapshot {
  totalCrons: number;
  totalRuns: number;
  totalErrors: number;
  p95Ms: number; // across ALL runs in window
  byCron: CronStatsRow[];
}

export interface SecuritySignalsSnapshot {
  csrfStorms: number;
  rateLimitStorms: number;
  circuitOpens: number;
  circuitRecovered: number;
}

export interface TechMetrics {
  health: ServiceHealthSnapshot | null;
  stuck: StuckPaymentsSnapshot | null;
  webhooks: WebhookIntakeSnapshot | null;
  cronHealth: CronHealthSnapshot | null;
  security: SecuritySignalsSnapshot | null;
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
    logger.warn({ err, label }, "tech-digest fetcher failed");
    return fallback;
  }
}

// -----------------------------------------------------------------------------
// Fetchers
// -----------------------------------------------------------------------------

export async function fetchServiceHealth(): Promise<ServiceHealthSnapshot> {
  const snap = await buildHealthStatusSnapshot();
  const lines: ServiceHealthLine[] = snap.services.map((s: AdminHealthServiceStatus) => ({
    name: s.name,
    status: s.status,
    latencyMs: s.latencyMs,
    detail: s.detail,
  }));
  return {
    overall: snap.overallStatus,
    lines,
  };
}

export async function fetchStuckPayments(): Promise<StuckPaymentsSnapshot> {
  // Same call shape as the payment-fulfillment-sweep cron.
  const res = await supabaseFetch("/rest/v1/rpc/find_stuck_payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_limit: 50 }),
  });
  if (!res.ok) return { count: 0, sampleIds: [] };
  const body = await res.json().catch(() => null);
  // RPC may return null/error envelope under transient conditions — coerce
  // to empty array so the section renders "all clear" rather than crashing.
  const rows = (Array.isArray(body) ? body : []) as Array<{ payment_id: number }>;
  return {
    count: rows.length,
    sampleIds: rows.slice(0, 3).map((r) => r.payment_id),
  };
}

export async function fetchWebhookIntake(
  sinceIso: string,
  untilIso: string
): Promise<WebhookIntakeSnapshot> {
  // Stripe webhook events
  const eventsRes = await supabaseFetch(
    `/rest/v1/payment_webhook_event?select=event_type,processed,processing_error&${dateRange("received_at", sinceIso, untilIso)}`,
    { headers: { Range: "0-4999" } }
  );
  let stripeTotal = 0;
  let stripeProcessed = 0;
  let stripeErrors = 0;
  const eventCounts = new Map<string, number>();
  if (eventsRes.ok) {
    const rows = (await eventsRes.json()) as Array<{
      event_type: string | null;
      processed: boolean | null;
      processing_error: string | null;
    }>;
    stripeTotal = rows.length;
    for (const r of rows) {
      if (r.processed) stripeProcessed += 1;
      if (r.processing_error) stripeErrors += 1;
      const et = r.event_type ?? "unknown";
      eventCounts.set(et, (eventCounts.get(et) ?? 0) + 1);
    }
  }
  const stripeTopEvents: WebhookIntakeRow[] = [...eventCounts.entries()]
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Resend engagement counters live in Upstash KV (one key per kind per UTC
  // day, written by the Resend webhook). Use the day-stamp from sinceIso.
  let resendOpened = 0;
  let resendClicked = 0;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    try {
      const redis = new Redis({ url, token });
      const day = sinceIso.slice(0, 10);
      const [openedRaw, clickedRaw] = await redis.mget(
        `email_engage:opened:${day}`,
        `email_engage:clicked:${day}`
      );
      const toNum = (v: unknown): number =>
        typeof v === "number" ? v : v == null ? 0 : Number(v) || 0;
      resendOpened = toNum(openedRaw);
      resendClicked = toNum(clickedRaw);
    } catch (err) {
      logger.warn({ err }, "tech-digest: Resend KV fetch failed");
    }
  }

  return {
    stripeTotal,
    stripeProcessed,
    stripeErrors,
    stripeTopEvents,
    resendOpened,
    resendClicked,
  };
}

/** Internal helper: percentile of a sorted-ascending number array. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  // eslint-disable-next-line security/detect-object-injection -- idx clamped above
  return sortedAsc[idx] ?? 0;
}

export async function fetchCronHealth(
  sinceIso: string,
  untilIso: string
): Promise<CronHealthSnapshot> {
  // Real cron-health from the cron_run history table — written by every cron's
  // finally block via recordCronRun(). Replaces the previous proxy that
  // counted slack_alert_sent rows for kind=cron_slow.
  const res = await supabaseFetch(
    `/rest/v1/cron_run?select=cron_name,duration_ms,status&${dateRange("started_at", sinceIso, untilIso)}`,
    { headers: { Range: "0-9999" } }
  );
  if (!res.ok) {
    return { totalCrons: 0, totalRuns: 0, totalErrors: 0, p95Ms: 0, byCron: [] };
  }
  const rows = (await res.json()) as Array<{
    cron_name: string | null;
    duration_ms: number | string | null;
    status: string | null;
  }>;

  const byName = new Map<string, { runs: number; errors: number; durations: number[] }>();
  const allDurations: number[] = [];
  for (const r of rows) {
    if (!r.cron_name) continue;
    const slot = byName.get(r.cron_name) ?? { runs: 0, errors: 0, durations: [] };
    slot.runs += 1;
    if (r.status === "error" || r.status === "timeout") slot.errors += 1;
    const dur = Number(r.duration_ms);
    if (Number.isFinite(dur) && dur >= 0) {
      slot.durations.push(dur);
      allDurations.push(dur);
    }
    byName.set(r.cron_name, slot);
  }

  const byCron: CronStatsRow[] = [...byName.entries()]
    .map(([cronName, s]) => {
      const sorted = [...s.durations].sort((a, b) => a - b);
      const avg =
        sorted.length > 0 ? Math.round(sorted.reduce((sum, n) => sum + n, 0) / sorted.length) : 0;
      return {
        cronName,
        runs: s.runs,
        errors: s.errors,
        avgMs: avg,
        p95Ms: percentile(sorted, 95),
      };
    })
    .sort((a, b) => b.errors - a.errors || b.p95Ms - a.p95Ms);

  const sortedAll = allDurations.sort((a, b) => a - b);
  const totalErrors = byCron.reduce((sum, c) => sum + c.errors, 0);
  return {
    totalCrons: byName.size,
    totalRuns: rows.length,
    totalErrors,
    p95Ms: percentile(sortedAll, 95),
    byCron,
  };
}

export async function fetchSecuritySignals(
  sinceIso: string,
  untilIso: string
): Promise<SecuritySignalsSnapshot> {
  const countKind = async (kind: string): Promise<number> =>
    fetchExactCount(
      `/rest/v1/slack_alert_sent?select=id&kind=eq.${kind}&${dateRange("sent_at", sinceIso, untilIso)}`
    );

  const [csrfStorms, rateLimitStorms, circuitOpens, circuitRecovered] = await Promise.all([
    countKind("csrf_storm"),
    countKind("rate_limit_storm"),
    countKind("circuit_open"),
    countKind("circuit_recovered"),
  ]);

  return { csrfStorms, rateLimitStorms, circuitOpens, circuitRecovered };
}

// -----------------------------------------------------------------------------
// Orchestrator
// -----------------------------------------------------------------------------

export async function fetchTechMetrics(sinceIso: string, untilIso: string): Promise<TechMetrics> {
  const [health, stuck, webhooks, cronHealth, security] = await Promise.all([
    safe<ServiceHealthSnapshot | null>("health", () => fetchServiceHealth(), null),
    safe<StuckPaymentsSnapshot | null>("stuck", () => fetchStuckPayments(), null),
    safe<WebhookIntakeSnapshot | null>(
      "webhooks",
      () => fetchWebhookIntake(sinceIso, untilIso),
      null
    ),
    safe<CronHealthSnapshot | null>("cronHealth", () => fetchCronHealth(sinceIso, untilIso), null),
    safe<SecuritySignalsSnapshot | null>(
      "security",
      () => fetchSecuritySignals(sinceIso, untilIso),
      null
    ),
  ]);

  return { health, stuck, webhooks, cronHealth, security };
}
