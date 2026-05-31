/**
 * F-16: daily row-count digest for append-only tables.
 *
 * Posts a one-line Slack summary of row counts to ops so we notice when a
 * table grows unexpectedly (a hot partition, a runaway bot, a stuck cron).
 * The F-02 retention purge keeps most of these bounded, but visible numbers
 * make growth anomalies investigable.
 *
 * Watched tables (extend as new high-volume tables land):
 *   analytics_event
 *   survey_partial_save
 *   invite_event
 *   payment_webhook_event
 *   scoring_result
 *   personal_report
 *   survey_submission
 *
 * Tripwire: if any table exceeds its `alertAt` threshold, the Slack message
 * is prefixed with :rotating_light: instead of :chart_with_upwards_trend:.
 *
 * Schedule: daily, 9:15 UTC (after the funnel-digest at 9:00 so the
 * conversation in #ops flows top-to-bottom: funnel → product → tech → size).
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getBreaker } from "@shared/http/circuit-breaker";
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Watch {
  table: string;
  alertAt: number;
}

const WATCHED: Watch[] = [
  { table: "analytics_event", alertAt: 50_000_000 },
  { table: "survey_partial_save", alertAt: 200_000 },
  { table: "invite_event", alertAt: 1_000_000 },
  { table: "payment_webhook_event", alertAt: 5_000_000 },
  { table: "scoring_result", alertAt: 5_000_000 },
  { table: "personal_report", alertAt: 5_000_000 },
  { table: "survey_submission", alertAt: 5_000_000 },
];

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

async function countRows(table: string): Promise<number | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  // PostgREST exact count comes back in the `Content-Range` response header
  // as "<from>-<to>/<total>". HEAD avoids transferring rows.
  return getBreaker("supabase").fire(async () => {
    const res = await fetchWithTimeout(`${url}/rest/v1/${table}?select=id`, {
      method: "HEAD",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
      timeoutMs: 5000,
    });
    if (!res.ok && res.status !== 206) return null;
    const range = res.headers.get("content-range") ?? "";
    const total = range.split("/")[1];
    if (!total || total === "*") return null;
    const n = parseInt(total, 10);
    return Number.isFinite(n) ? n : null;
  });
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
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

  const trackDuration = startCronTimer("table-size-digest", 25);
  const startMs = Date.now();
  let cronError: string | undefined;

  try {
    const counts: Array<{ table: string; count: number | null; over: boolean }> = [];
    for (const w of WATCHED) {
      const c = await countRows(w.table);
      counts.push({ table: w.table, count: c, over: c !== null && c >= w.alertAt });
    }

    const anyOver = counts.some((c) => c.over);
    const icon = anyOver ? ":rotating_light:" : ":chart_with_upwards_trend:";
    const summary = counts
      .map((c) => {
        const cell = c.count === null ? "?" : fmt(c.count);
        return `${escapeSlack(c.table)}=${cell}${c.over ? "*" : ""}`;
      })
      .join(", ");

    await notifySlack({
      channel: "ops",
      kind: "table_size_digest",
      text: `${icon} Daily table sizes — ${summary}`,
      username: "ops_alerts",
    });

    logger.info({ counts }, "table-size-digest finished");
    return NextResponse.json({ success: true, counts });
  } catch (err) {
    cronError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "table-size-digest failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("table-size-digest", startMs, cronError ? "error" : "success", cronError);
  }
}
