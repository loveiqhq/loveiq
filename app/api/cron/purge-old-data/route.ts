/**
 * F-02: Daily retention purge.
 *
 * ⚠️ POSTPONED — NOT LIVE (decision 2026-05-31). The destructive purge is
 * intentionally disabled until the product has more customers and data old
 * enough to warrant trimming. TWO independent gates keep it dormant:
 *   1. The `/api/cron/purge-old-data` schedule is REMOVED from vercel.json,
 *      so Vercel never invokes it.
 *   2. The `PURGE_OLD_DATA_ENABLED` env flag below — even a manual or
 *      accidental call is a no-op unless it is explicitly "true".
 * TO RE-ENABLE (when ready): set the `PURGE_OLD_DATA_ENABLED` env var to the
 * value `true` in the prod Vercel env AND re-add the cron entry to vercel.json.
 * Review the retention windows below first. (Reminder also tracked in CLAUDE.md
 * "Postponed / TODO".)
 *
 * GET /api/cron/purge-old-data
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`. Skips on non-prod
 * cron hosts (the staging Vercel project shares the prod DB).
 *
 * Retention windows:
 *   survey_partial_save     >30d   (auto-purges abandoned draft answers)
 *   analytics_event         >180d  (engagement telemetry, no longer needed for ML/admin)
 *   payment_webhook_event   >365d  (Stripe events; one year is the dispute window)
 *
 * Note: rate limiter now lives in Upstash KV (per-key TTLs auto-evict) so no
 * DB purge is needed for that data path.
 *
 * Adjust by editing RETENTION_DAYS below. Document any change in CLAUDE.md.
 *
 * The route fails open per-table: a failure on one table does not abort the
 * others. The overall HTTP response is 200 unless every delete failed (a
 * sign of Supabase-wide outage). Per-table failures still surface in the
 * `errors` array and via cron_run telemetry.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { supabaseFetch } from "@features/admin/server/supabase";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 50;

interface RetentionRule {
  table: string;
  days: number;
  /**
   * Column used for the "age" comparison. Default: created_at. Tables that
   * use a different column declare it here to avoid silent no-ops.
   */
  column?: string;
}

const RETENTION_DAYS: RetentionRule[] = [
  { table: "survey_partial_save", days: 30, column: "saved_at" },
  { table: "analytics_event", days: 180, column: "event_time" },
  { table: "payment_webhook_event", days: 365, column: "received_at" },
  // R-02: Resend webhook idempotency rows only need to outlive Svix's retry
  // window (5 min). 30 days is generously beyond that and matches the
  // partial-save retention so the cron's blast radius stays bounded.
  { table: "resend_webhook_event", days: 30, column: "received_at" },
  // T-17: telemetry table — ~5000 rows/day across crons. 90d horizon
  // keeps tech-digest's 24h scans accurate while preventing unbounded
  // growth. Not a legal/compliance retention.
  { table: "cron_run", days: 90, column: "started_at" },
  // T-17: invite-share + click tracking. 180d retention — long enough
  // for product-team funnel attribution, short enough to bound storage
  // for users who never converted (highest volume of invite_event rows).
  { table: "invite_event", days: 180, column: "created_at" },
  // P-09: Slack dead-letter rows are operational forensics — 90 days
  // matches cron_run so a quarterly incident review still has the trail.
  { table: "slack_dead_letter", days: 90, column: "attempted_at" },
];

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

async function purgeTable(rule: RetentionRule): Promise<{ deleted: number; error?: string }> {
  const cutoff = new Date(Date.now() - rule.days * 24 * 60 * 60 * 1000).toISOString();
  const column = rule.column ?? "created_at";
  const path = `/rest/v1/${rule.table}?${column}=lt.${encodeURIComponent(cutoff)}`;
  try {
    // Prefer: return=minimal + count=exact returns the row count in the
    // Content-Range header instead of streaming the deleted rows in the
    // response body. On a first cron run with months of accumulated rows
    // the body would otherwise be many MB and risk an out-of-memory.
    const res = await supabaseFetch(path, {
      method: "DELETE",
      headers: { Prefer: "return=minimal,count=exact" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { table: rule.table, status: res.status, text: text.slice(0, 200) },
        "Purge non-ok"
      );
      return { deleted: 0, error: `status_${res.status}` };
    }
    // Content-Range format on bulk DELETE with count=exact: "*/<total>"
    // where <total> is the number of rows that matched (= deleted).
    const range = res.headers.get("content-range") ?? "";
    const totalStr = range.split("/")[1];
    const deleted = totalStr && totalStr !== "*" ? parseInt(totalStr, 10) : 0;
    return { deleted: Number.isFinite(deleted) ? deleted : 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ table: rule.table, err }, "Purge threw");
    return { deleted: 0, error: msg };
  }
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const auth = request.headers.get("authorization") || "";
  if (!safeCompare(auth, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }

  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  // POSTPONED safety gate (see file header). Destructive deletes stay OFF until
  // PURGE_OLD_DATA_ENABLED is explicitly "true" in the env. This is the second
  // of two gates (the first being the removed vercel.json schedule).
  if (process.env.PURGE_OLD_DATA_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }

  const trackDuration = startCronTimer("purge-old-data", 50);
  const startMs = Date.now();
  let cronError: string | undefined;

  const summary: Record<string, { deleted: number; error?: string }> = {};

  try {
    for (const rule of RETENTION_DAYS) {
      summary[rule.table] = await purgeTable(rule);
    }

    const totalDeleted = Object.values(summary).reduce((acc, r) => acc + r.deleted, 0);
    const failed = Object.entries(summary)
      .filter(([, r]) => r.error)
      .map(([t]) => t);

    logger.info({ summary, totalDeleted, failed }, "purge-old-data finished");

    // Whole-cron failure: every rule errored. Surface as a 500 so Vercel
    // shows the cron as failed and ops sees the api_5xx Slack ping.
    if (failed.length === RETENTION_DAYS.length) {
      cronError = "all_rules_failed";
      return NextResponse.json({ success: false, summary }, { status: 500 });
    }

    return NextResponse.json({ success: true, summary, totalDeleted });
  } catch (err) {
    cronError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "purge-old-data cron failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("purge-old-data", startMs, cronError ? "error" : "success", cronError);
  }
}
