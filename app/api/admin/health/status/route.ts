import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { buildTrustDescriptor } from "@/lib/admin/next-level";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface ServiceStatus {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  lastCheck: string;
  detail: string;
}

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-health",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const now = new Date().toISOString();
  const services: ServiceStatus[] = [];
  const integrations: Array<{
    name: string;
    status: "healthy" | "degraded" | "down";
    detail: string;
  }> = [];

  // Check Supabase
  try {
    const start = Date.now();
    const res = await supabaseFetch(`/rest/v1/survey?select=id&limit=1`);
    const latency = Date.now() - start;
    services.push({
      name: "Supabase",
      status: res.ok ? (latency > 2000 ? "degraded" : "healthy") : "down",
      latencyMs: latency,
      lastCheck: now,
      detail: res.ok ? `${latency}ms response` : `Status ${res.status}`,
    });
  } catch {
    services.push({
      name: "Supabase",
      status: "down",
      latencyMs: null,
      lastCheck: now,
      detail: "Connection failed",
    });
  }

  // Check scoring engine (% of recent submissions with scoring)
  let scoringSuccessRate = 100;
  try {
    const [submRes, scoredRes] = await Promise.all([
      supabaseFetch(`/rest/v1/survey_submission?select=id&status=eq.completed&limit=1`, {
        headers: { Prefer: "count=exact" },
      }),
      supabaseFetch(`/rest/v1/scoring_result?select=id&limit=1`, {
        headers: { Prefer: "count=exact" },
      }),
    ]);

    const submTotal = parseInt(submRes.headers?.get("content-range")?.split("/")[1] || "0", 10);
    const scoredTotal = parseInt(scoredRes.headers?.get("content-range")?.split("/")[1] || "0", 10);
    const successRate = submTotal > 0 ? Math.round((scoredTotal / submTotal) * 100) : 100;
    scoringSuccessRate = successRate;

    services.push({
      name: "Scoring Engine",
      status: successRate >= 95 ? "healthy" : successRate >= 80 ? "degraded" : "down",
      latencyMs: null,
      lastCheck: now,
      detail: `${successRate}% scored (${scoredTotal}/${submTotal})`,
    });
  } catch {
    services.push({
      name: "Scoring Engine",
      status: "degraded",
      latencyMs: null,
      lastCheck: now,
      detail: "Unable to check",
    });
  }

  // Check last submission age
  try {
    const res = await supabaseFetch(
      `/rest/v1/survey_submission?select=created_date_time&order=created_date_time.desc&limit=1`
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0) {
        const lastSubmission = rows[0].created_date_time;
        const ageHours = Math.round((Date.now() - new Date(lastSubmission).getTime()) / 3_600_000);
        services.push({
          name: "Survey Pipeline",
          status: ageHours < 24 ? "healthy" : ageHours < 72 ? "degraded" : "down",
          latencyMs: null,
          lastCheck: now,
          detail: `Last submission ${ageHours}h ago`,
        });
      }
    }
  } catch {
    services.push({
      name: "Survey Pipeline",
      status: "degraded",
      latencyMs: null,
      lastCheck: now,
      detail: "Unable to check",
    });
  }

  // Resend (check env var presence as proxy)
  services.push({
    name: "Resend (Email)",
    status: process.env.RESEND_API_KEY ? "healthy" : "degraded",
    latencyMs: null,
    lastCheck: now,
    detail: process.env.RESEND_API_KEY ? "API key configured" : "API key missing",
  });
  integrations.push({
    name: "Resend",
    status: process.env.RESEND_API_KEY ? "healthy" : "degraded",
    detail: process.env.RESEND_API_KEY ? "Configured" : "Missing API key",
  });

  // Slack webhooks
  const slackConfigured = !!(
    process.env.SLACK_WAITLIST_WEBHOOK_URL ||
    process.env.SLACK_CONTACT_WEBHOOK_URL ||
    process.env.SLACK_SURVEY_WEBHOOK_URL
  );
  services.push({
    name: "Slack Webhooks",
    status: slackConfigured ? "healthy" : "degraded",
    latencyMs: null,
    lastCheck: now,
    detail: slackConfigured ? "Webhooks configured" : "No webhooks configured",
  });
  integrations.push({
    name: "Slack",
    status: slackConfigured ? "healthy" : "degraded",
    detail: slackConfigured ? "Alert destinations configured" : "No alert destinations configured",
  });

  let submissionsCount = 0;
  let completedCount = 0;
  let reportCount = 0;
  let reportViewedCount = 0;
  let paymentCount = 0;
  let analyticsEventCount = 0;
  try {
    const [submissionsRes, reportsRes, sessionsRes, paymentsRes, analyticsRes] = await Promise.all([
      supabaseFetch(`/rest/v1/survey_submission?select=id,status,created_date_time`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/personal_report?select=id,created_date_time`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/report_session?select=personal_report_id`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/payment?select=id,status,payment_date_time`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/analytics_event?select=id,event_time,event_type`, {
        headers: { Range: "0-49999" },
      }),
    ]);

    if (submissionsRes.ok) {
      const submissions = (await submissionsRes.json()) as Array<{
        id: number;
        status: string;
        created_date_time: string;
      }>;
      submissionsCount = submissions.length;
      completedCount = submissions.filter((row) => row.status === "completed").length;
    }

    if (reportsRes.ok) {
      const reports = (await reportsRes.json()) as Array<{ id: number; created_date_time: string }>;
      reportCount = reports.length;
      const trust = buildTrustDescriptor({
        source: "personal_report",
        mode: "live",
        sampleSize: reports.length,
        lastUpdated: reports[0]?.created_date_time ?? null,
      });
      integrations.push({
        name: "Report Generation",
        status: trust.warning ? "degraded" : "healthy",
        detail: trust.warning ?? `${reports.length} reports generated`,
      });
    }

    if (sessionsRes.ok) {
      const sessions = (await sessionsRes.json()) as Array<{ personal_report_id: number }>;
      reportViewedCount = new Set(sessions.map((row) => row.personal_report_id)).size;
    }

    if (paymentsRes.ok) {
      const payments = (await paymentsRes.json()) as Array<{
        id: number;
        status: string;
        payment_date_time: string;
      }>;
      paymentCount = payments.filter((row) => row.status === "succeeded").length;
      integrations.push({
        name: "Payments",
        status: paymentCount > 0 ? "healthy" : "degraded",
        detail:
          paymentCount > 0
            ? `${paymentCount} succeeded payments captured`
            : "No succeeded payments yet",
      });
    }

    if (analyticsRes.ok) {
      const analyticsEvents = (await analyticsRes.json()) as Array<{
        id: number;
        event_time: string;
        event_type: string;
      }>;
      analyticsEventCount = analyticsEvents.length;
      integrations.push({
        name: "Analytics Events",
        status: analyticsEvents.length > 0 ? "healthy" : "degraded",
        detail:
          analyticsEvents.length > 0
            ? `${analyticsEvents.length} analytics events captured`
            : "No analytics events captured",
      });
    }
  } catch (err) {
    logger.warn({ err }, "Health status: failed to compute trust and integration layers");
  }

  const healthyCount = services.filter((s) => s.status === "healthy").length;
  const overallStatus =
    healthyCount === services.length
      ? "healthy"
      : healthyCount >= services.length / 2
        ? "degraded"
        : "down";

  return NextResponse.json({
    overallStatus,
    services,
    integrations,
    trackingCoverage: [
      {
        event: "survey_start",
        expected: submissionsCount,
        actual: analyticsEventCount,
        status:
          analyticsEventCount >= submissionsCount && submissionsCount > 0
            ? "healthy"
            : analyticsEventCount > 0
              ? "degraded"
              : "down",
        detail:
          analyticsEventCount === 0
            ? "No analytics events observed for survey starts."
            : `${analyticsEventCount} analytics events for ${submissionsCount} submissions`,
      },
      {
        event: "report_view",
        expected: reportCount,
        actual: reportViewedCount,
        status: reportCount === 0 ? "degraded" : reportViewedCount > 0 ? "healthy" : "degraded",
        detail:
          reportCount === 0
            ? "No reports generated yet."
            : `${reportViewedCount} viewed reports out of ${reportCount} generated`,
      },
      {
        event: "payment_conversion",
        expected: reportViewedCount,
        actual: paymentCount,
        status: paymentCount > 0 ? "healthy" : reportViewedCount > 0 ? "degraded" : "down",
        detail:
          paymentCount > 0
            ? `${paymentCount} payment conversions captured`
            : "No payment conversions captured in the current dataset",
      },
    ],
    trustLayers: [
      buildTrustDescriptor({
        source: "survey_submission",
        mode: "live",
        sampleSize: submissionsCount,
        lastUpdated: now,
      }),
      buildTrustDescriptor({
        source: "scoring_result",
        mode: "derived",
        sampleSize: completedCount,
        lastUpdated: now,
        warning:
          scoringSuccessRate < 95
            ? `Scoring agreement/output is below guardrail at ${scoringSuccessRate}%.`
            : null,
      }),
      buildTrustDescriptor({
        source: "analytics_event",
        mode: analyticsEventCount > 0 ? "live" : "sampled",
        sampleSize: analyticsEventCount,
        lastUpdated: analyticsEventCount > 0 ? now : null,
        warning:
          analyticsEventCount === 0
            ? "Analytics event coverage is missing, so browser/embed tracking is incomplete."
            : null,
      }),
    ],
    guardrails: [
      {
        label: "Completion Rate",
        current: submissionsCount > 0 ? Math.round((completedCount / submissionsCount) * 100) : 0,
        target: 65,
        status:
          submissionsCount > 0 && completedCount / submissionsCount >= 0.65
            ? "healthy"
            : submissionsCount > 0
              ? "degraded"
              : "down",
        detail: `${completedCount}/${submissionsCount} submissions completed`,
        href: "/admin/product-kpis",
      },
      {
        label: "Scoring Coverage",
        current: scoringSuccessRate,
        target: 95,
        status:
          scoringSuccessRate >= 95 ? "healthy" : scoringSuccessRate >= 80 ? "degraded" : "down",
        detail: `${scoringSuccessRate}% of completed submissions are scored`,
        href: "/admin/scoring",
      },
      {
        label: "Report View Rate",
        current: reportCount > 0 ? Math.round((reportViewedCount / reportCount) * 100) : 0,
        target: 50,
        status:
          reportCount > 0 && reportViewedCount / reportCount >= 0.5
            ? "healthy"
            : reportCount > 0
              ? "degraded"
              : "down",
        detail: `${reportViewedCount}/${reportCount} generated reports viewed`,
        href: "/admin/reports",
      },
    ],
    checkedAt: now,
  });
}
