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
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";

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

  // Skip on the staging Vercel project (shares the prod DB).
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const trackDuration = startCronTimer("abandoned-checkout-alert", 50);
  const startMs = Date.now();
  let cronError: string | undefined;
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

    // Two-step lookup. The payment table has no survey_submission_id column —
    // the relationship is payment.personal_report_id → personal_report.id →
    // personal_report.survey_submission_id. PostgREST embed-with-filter via
    // `personal_report!inner.survey_submission_id=in.(...)` returned 400 in
    // prod (see commit a48a217); fall back to the unambiguous 2-step path.
    //
    // Step 1: map candidate submissions to their personal_report ids.
    const prRes = await supabaseFetch(
      `/rest/v1/personal_report?survey_submission_id=in.(${submissionIds.join(",")})&select=id,survey_submission_id`
    );
    if (!prRes.ok) {
      const body = await prRes.text().catch(() => "");
      // slack:false — the top-level catch fires the Slack alert; this log
      // only carries detail (response body) for Vercel runtime logs.
      logger.error(
        { status: prRes.status, body, slack: false },
        "abandoned-checkout-alert: personal_report lookup failed"
      );
      throw new Error(`personal_report_lookup_failed:${prRes.status}`);
    }
    const prRows = (await prRes.json()) as Array<{
      id: number;
      survey_submission_id: number;
    }>;
    const subByPersonalReport = new Map<number, number>(); // personal_report_id → submission_id
    for (const r of prRows) subByPersonalReport.set(r.id, r.survey_submission_id);

    // Step 2: find which of those personal_reports have a succeeded payment.
    const paid = new Set<number>();
    if (subByPersonalReport.size > 0) {
      const prIds = [...subByPersonalReport.keys()];
      const paidRes = await supabaseFetch(
        `/rest/v1/payment?personal_report_id=in.(${prIds.join(",")})&status=eq.succeeded&select=personal_report_id`
      );
      if (!paidRes.ok) {
        const body = await paidRes.text().catch(() => "");
        logger.error(
          { status: paidRes.status, body, slack: false },
          "abandoned-checkout-alert: payment lookup failed"
        );
        throw new Error(`payment_lookup_failed:${paidRes.status}`);
      }
      const paidRows = (await paidRes.json()) as Array<{ personal_report_id: number }>;
      for (const r of paidRows) {
        const subId = subByPersonalReport.get(r.personal_report_id);
        if (subId != null) paid.add(subId);
      }
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
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    // Fires the cron-slow Slack alert if elapsed > 80% of maxDuration.
    // Runs on both happy path AND catch so a hanging cron still gets noticed.
    await trackDuration();
    await recordCronRun(
      "abandoned-checkout-alert",
      startMs,
      cronError ? "error" : "success",
      cronError
    );
  }
}
