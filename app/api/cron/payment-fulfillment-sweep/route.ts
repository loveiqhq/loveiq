/**
 * GET /api/cron/payment-fulfillment-sweep
 *
 * Hourly safety net for stuck purchases. Catches the rare case where both
 * the Stripe webhook (lib/checkout/fulfillment.ts) AND the success-page
 * status-poll (app/api/stripe/checkout-session-status) failed to write
 * the archetype tier — for example: live webhook misconfigured AND user
 * closed the tab before /checkout/return polled, or a transient Supabase
 * outage during fulfillment.
 *
 * Logic:
 *   - Find every payment row where status='succeeded' and metadata.plan is
 *     a recognized purchase plan, but personal_report.archetype_tiers does
 *     NOT reflect the bought tier.
 *   - For essentials / full_report: write the per-archetype tier via
 *     upsert_archetype_tier RPC (highest-tier-wins semantics).
 *   - For all_reports: write every known archetype at full_report tier
 *     via unlock_all_archetypes RPC.
 *
 * Both RPCs are idempotent — re-running on already-fulfilled rows is a
 * no-op. Safe to run hourly.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";
import { getBreaker } from "@shared/http/circuit-breaker";
import { KNOWN_ARCHETYPES, isArchetypeName } from "@features/report/server/archetypeSlug";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Fail-safe before Vercel's 60s function budget so a stuck Supabase call
// surfaces as our own 504 with telemetry, not a silent Vercel kill.
export const maxDuration = 50;

const SUPABASE_TIMEOUT_MS = 8_000;
// Cap so a single sweep never overruns Vercel's 60s function budget. If the
// backlog is ever larger than this, a follow-up run picks up the rest.
const SWEEP_LIMIT = 50;

// P-04: per-request SIGTERM flag — set by the listener installed in GET,
// cleared in finally. Vercel sends SIGTERM ~100-300ms before killing a
// stale Lambda; we want to stop processing rather than get truncated.
let terminated = false;

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

interface StuckPayment {
  payment_id: number;
  personal_report_id: number;
  plan: "essentials" | "full_report" | "core" | "all_reports";
  archetype: string | null;
  primary_archetype: string | null;
}

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
      timeoutMs: SUPABASE_TIMEOUT_MS,
    })
  );
}

async function findStuckPayments(): Promise<StuckPayment[]> {
  // Query payments + report state + scoring primary archetype in one round-trip.
  // RPC for the join logic (Supabase REST can't express conditional jsonb tier
  // checks ergonomically).
  const response = await supabaseFetch("/rest/v1/rpc/find_stuck_payments", {
    method: "POST",
    body: JSON.stringify({ p_limit: SWEEP_LIMIT }),
  });

  if (!response.ok) {
    throw new Error(`find_stuck_payments_failed:${response.status}`);
  }

  const rows = (await response.json()) as Array<{
    payment_id: number;
    personal_report_id: number;
    plan: string;
    archetype: string | null;
    primary_archetype: string | null;
  }>;

  return rows.filter(
    (row): row is StuckPayment =>
      row.plan === "essentials" ||
      row.plan === "full_report" ||
      row.plan === "core" ||
      row.plan === "all_reports"
  );
}

/**
 * Resolve the buyer's top-3 archetypes (by V5 match %) — the same ranking the
 * webhook's core fulfilment uses. Two small REST reads: personal_report →
 * submission, then scoring_result → percentages. Returns [] on any miss so the
 * caller skips rather than throws.
 */
async function resolveTopThreeArchetypes(personalReportId: number): Promise<string[]> {
  const prRes = await supabaseFetch(
    `/rest/v1/personal_report?id=eq.${personalReportId}&select=survey_submission_id&limit=1`
  );
  if (!prRes.ok) return [];
  const prRows = (await prRes.json()) as Array<{ survey_submission_id: number | null }>;
  const submissionId = prRows[0]?.survey_submission_id ?? null;
  if (!submissionId) return [];

  const srRes = await supabaseFetch(
    `/rest/v1/scoring_result?survey_submission_id=eq.${submissionId}&select=v5_percentages,percentages&limit=1`
  );
  if (!srRes.ok) return [];
  const srRows = (await srRes.json()) as Array<{
    v5_percentages: Record<string, number> | null;
    percentages: Record<string, number> | null;
  }>;
  const pct = srRows[0]?.v5_percentages ?? srRows[0]?.percentages ?? null;
  if (!pct || typeof pct !== "object") return [];

  return Object.entries(pct)
    .filter(([name, value]) => isArchetypeName(name) && typeof value === "number")
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 3)
    .map(([name]) => name);
}

async function fulfillStuckPayment(stuck: StuckPayment): Promise<"fixed" | "skipped"> {
  if (stuck.plan === "all_reports") {
    const response = await supabaseFetch("/rest/v1/rpc/unlock_all_archetypes", {
      method: "POST",
      body: JSON.stringify({
        p_personal_report_id: stuck.personal_report_id,
        p_archetype_names: [...KNOWN_ARCHETYPES],
      }),
    });
    if (!response.ok) {
      throw new Error(`unlock_all_archetypes_failed:${response.status}`);
    }
    return "fixed";
  }

  // Core ("All your core archetypes"): unlock the buyer's top-3 at full_report
  // tier — same as the webhook. The stuck row doesn't carry the ranking, so
  // resolve it here.
  if (stuck.plan === "core") {
    const top3 = await resolveTopThreeArchetypes(stuck.personal_report_id);
    if (top3.length === 0) {
      logger.warn(
        { paymentId: stuck.payment_id, personalReportId: stuck.personal_report_id },
        "Sweep: core payment has no resolvable top-3 archetypes, skipping"
      );
      return "skipped";
    }
    for (const name of top3) {
      const r = await supabaseFetch("/rest/v1/rpc/upsert_archetype_tier", {
        method: "POST",
        body: JSON.stringify({
          p_personal_report_id: stuck.personal_report_id,
          p_archetype: name,
          p_tier: "full_report",
        }),
      });
      if (!r.ok) throw new Error(`upsert_archetype_tier_failed:${r.status}`);
    }
    return "fixed";
  }

  // Per-archetype plans: prefer metadata.archetype; fall back to scoring's
  // primary archetype (same fallback the webhook uses). If neither is a known
  // archetype, skip — the webhook would too.
  const archetype =
    (stuck.archetype && isArchetypeName(stuck.archetype) ? stuck.archetype : null) ??
    (stuck.primary_archetype && isArchetypeName(stuck.primary_archetype)
      ? stuck.primary_archetype
      : null);

  if (!archetype) {
    logger.warn(
      { paymentId: stuck.payment_id, personalReportId: stuck.personal_report_id, plan: stuck.plan },
      "Sweep: stuck payment has no resolvable archetype, skipping"
    );
    return "skipped";
  }

  const response = await supabaseFetch("/rest/v1/rpc/upsert_archetype_tier", {
    method: "POST",
    body: JSON.stringify({
      p_personal_report_id: stuck.personal_report_id,
      p_archetype: archetype,
      p_tier: stuck.plan,
    }),
  });
  if (!response.ok) {
    throw new Error(`upsert_archetype_tier_failed:${response.status}`);
  }
  return "fixed";
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

  // Skip on the staging Vercel project (shares the prod DB). Critical:
  // this cron mutates real prod payment + report state.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const trackDuration = startCronTimer("payment-fulfillment-sweep", 50);
  const startMs = Date.now();
  let cronError: string | undefined;

  // P-04: install one-shot SIGTERM listener; the `process.off` in finally
  // prevents stale handlers leaking across warm-Lambda re-invocations.
  terminated = false;
  const onSigterm = () => {
    terminated = true;
    logger.warn("payment-fulfillment-sweep: SIGTERM received");
  };
  process.once("SIGTERM", onSigterm);

  const summary = { scanned: 0, fixed: 0, skipped: 0, errors: 0 };

  try {
    const stuck = await findStuckPayments();
    summary.scanned = stuck.length;

    for (const row of stuck) {
      if (terminated) {
        logger.warn(
          { processed: summary.fixed + summary.skipped + summary.errors, total: stuck.length },
          "payment-fulfillment-sweep: SIGTERM received mid-loop; exiting"
        );
        break;
      }
      try {
        const result = await fulfillStuckPayment(row);
        if (result === "fixed") summary.fixed += 1;
        else summary.skipped += 1;
      } catch (err) {
        summary.errors += 1;
        logger.error(
          { err, paymentId: row.payment_id, personalReportId: row.personal_report_id },
          "Sweep: failed to fulfill stuck payment"
        );
      }
    }

    if (summary.fixed > 0) {
      logger.warn(
        summary,
        "Sweep: rescued stuck purchases — investigate webhook + status-poll health"
      );
    } else {
      logger.info(summary, "Sweep: no stuck purchases");
    }

    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    logger.error({ err, summary }, "Sweep: top-level failure");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  } finally {
    process.off("SIGTERM", onSigterm);
    await trackDuration();
    await recordCronRun(
      "payment-fulfillment-sweep",
      startMs,
      cronError ? "error" : "success",
      cronError
    );
  }
}
