/**
 * GET /api/cron/abandoned-checkout-alert
 *
 * Every 30 minutes: find sessions that fired `begin_checkout` more than
 * 30 minutes ago but never resulted in a succeeded payment, and emit one
 * Slack ping per (submission_id) to the ops channel.
 *
 * Dedup via slack_alert_sent so the same abandoned checkout pings once.
 * Idempotent + cron-safe.
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

const SCAN_LIMIT = 100;
const ABANDONED_AFTER_MS = 30 * 60_000;

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

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS).toISOString();
    // Pull recent begin_checkout events older than the abandon threshold.
    const beginRes = await supabaseFetch(
      `/rest/v1/analytics_event?event_type=eq.begin_checkout&event_time=lt.${encodeURIComponent(cutoff)}&select=survey_submission_id,event_time&order=event_time.desc&limit=${SCAN_LIMIT}`
    );
    if (!beginRes.ok) {
      throw new Error(`begin_checkout_scan_failed:${beginRes.status}`);
    }
    const beginRows = (await beginRes.json()) as Array<{
      survey_submission_id: number | null;
      event_time: string;
    }>;
    const submissionIds = Array.from(
      new Set(beginRows.map((r) => r.survey_submission_id).filter((id): id is number => !!id))
    );

    if (submissionIds.length === 0) {
      return NextResponse.json({ scanned: 0, pinged: 0 });
    }

    // The payment table has no survey_submission_id column. The relationship
    // is: payment.personal_report_id → personal_report.id, and
    // personal_report.survey_submission_id → survey_submission.id.
    // Use PostgREST embedded resource filtering: pull payments whose related
    // personal_report belongs to one of our candidate submissions.
    const paidRes = await supabaseFetch(
      `/rest/v1/payment?select=personal_report!inner(survey_submission_id)&status=eq.succeeded&personal_report.survey_submission_id=in.(${submissionIds.join(",")})`
    );
    if (!paidRes.ok) {
      throw new Error(`payment_lookup_failed:${paidRes.status}`);
    }
    const paidRows = (await paidRes.json()) as Array<{
      personal_report: { survey_submission_id: number } | null;
    }>;
    const paid = new Set<number>();
    for (const r of paidRows) {
      const id = r.personal_report?.survey_submission_id;
      if (id != null) paid.add(id);
    }

    const abandoned = submissionIds.filter((id) => !paid.has(id));
    const pendingPings: Promise<void>[] = [];

    for (const submissionId of abandoned) {
      const claimed = await tryClaimSlackAlert(
        "abandoned_checkout",
        "survey_submission",
        String(submissionId)
      );
      if (!claimed) continue;
      pendingPings.push(
        notifySlack({
          channel: "ops",
          kind: "abandoned_checkout",
          text: `:hourglass: Abandoned checkout — submission #${submissionId} hit begin_checkout 30m+ ago, no purchase`,
          username: "ops_alerts",
        })
      );
    }

    // Await all webhook POSTs before responding — Vercel freezes the sandbox
    // the moment a Response is returned, so unawaited fetches get dropped.
    await Promise.allSettled(pendingPings);

    return NextResponse.json({
      scanned: submissionIds.length,
      abandoned: abandoned.length,
      pinged: pendingPings.length,
    });
  } catch (err) {
    logger.error({ err }, "abandoned-checkout-alert cron failed");
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}
