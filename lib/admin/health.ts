import { buildTrustDescriptor } from "@/lib/admin/next-level";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

export interface AdminHealthServiceStatus {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  lastCheck: string;
  detail: string;
}

export interface AdminHealthIntegrationStatus {
  name: string;
  status: "healthy" | "degraded" | "down";
  detail: string;
}

export interface AdminTrackingCoverageItem {
  event: string;
  expected: number;
  actual: number;
  status: "healthy" | "degraded" | "down";
  detail: string;
}

export interface AdminHealthGuardrail {
  label: string;
  current: number;
  target: number;
  status: "healthy" | "degraded" | "down";
  detail: string;
  href: string;
}

export interface AdminHealthSlo {
  key: string;
  label: string;
  owner: "tech" | "product" | "growth";
  status: "healthy" | "degraded" | "down";
  objective: string;
  current: string;
  errorBudgetRemaining: number;
  measurementWindow: string;
  detail: string;
  href: string;
}

export interface AdminPerformanceHotspot {
  title: string;
  category: "service" | "tracking" | "guardrail" | "trust" | "rate-limit" | "webhook";
  severity: "risk" | "watch";
  value: string;
  detail: string;
  href: string;
  owner: "tech" | "product" | "growth";
}

export interface AdminHealthSnapshot {
  overallStatus: "healthy" | "degraded" | "down";
  services: AdminHealthServiceStatus[];
  integrations: AdminHealthIntegrationStatus[];
  trackingCoverage: AdminTrackingCoverageItem[];
  trustLayers: ReturnType<typeof buildTrustDescriptor>[];
  guardrails: AdminHealthGuardrail[];
  slos: AdminHealthSlo[];
  performanceHotspots: AdminPerformanceHotspot[];
  checkedAt: string;
}

function clampPercentage(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function higherIsBetterBudget(actual: number, target: number, warning: number) {
  if (actual >= target) return 100;
  if (actual <= warning) return 0;
  return clampPercentage(((actual - warning) / (target - warning)) * 100);
}

function lowerIsBetterBudget(actual: number, target: number, warning: number) {
  if (actual <= target) return 100;
  if (actual >= warning) return 0;
  return clampPercentage(((warning - actual) / (warning - target)) * 100);
}

export async function buildHealthStatusSnapshot(): Promise<AdminHealthSnapshot> {
  const now = new Date().toISOString();
  const services: AdminHealthServiceStatus[] = [];
  const integrations: AdminHealthIntegrationStatus[] = [];
  let supabaseLatencyMs: number | null = null;
  let pipelineFreshnessHours: number | null = null;
  let scoringSuccessRate = 100;

  try {
    const start = Date.now();
    const res = await supabaseFetch("/rest/v1/survey?select=id&limit=1");
    const latency = Date.now() - start;
    supabaseLatencyMs = latency;
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

  try {
    const [submRes, scoredRes] = await Promise.all([
      supabaseFetch("/rest/v1/survey_submission?select=id&status=eq.completed&limit=1", {
        headers: { Prefer: "count=exact" },
      }),
      supabaseFetch("/rest/v1/scoring_result?select=id&limit=1", {
        headers: { Prefer: "count=exact" },
      }),
    ]);

    const submTotal = parseInt(submRes.headers?.get("content-range")?.split("/")[1] || "0", 10);
    const scoredTotal = parseInt(scoredRes.headers?.get("content-range")?.split("/")[1] || "0", 10);
    scoringSuccessRate = submTotal > 0 ? Math.round((scoredTotal / submTotal) * 100) : 100;

    services.push({
      name: "Scoring Engine",
      status: scoringSuccessRate >= 95 ? "healthy" : scoringSuccessRate >= 80 ? "degraded" : "down",
      latencyMs: null,
      lastCheck: now,
      detail: `${scoringSuccessRate}% scored (${scoredTotal}/${submTotal})`,
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

  try {
    const res = await supabaseFetch(
      "/rest/v1/survey_submission?select=created_date_time&order=created_date_time.desc&limit=1"
    );
    if (res.ok) {
      const rows = (await res.json()) as Array<{ created_date_time: string }>;
      if (rows.length > 0) {
        const ageHours = Math.round(
          (Date.now() - new Date(rows[0].created_date_time).getTime()) / 3_600_000
        );
        pipelineFreshnessHours = ageHours;
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

  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  services.push({
    name: "Resend (Email)",
    status: resendConfigured ? "healthy" : "degraded",
    latencyMs: null,
    lastCheck: now,
    detail: resendConfigured ? "API key configured" : "API key missing",
  });
  integrations.push({
    name: "Resend",
    status: resendConfigured ? "healthy" : "degraded",
    detail: resendConfigured ? "Configured" : "Missing API key",
  });

  const slackConfigured = Boolean(
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
  let rateLimitHits: Array<{ bucket: string; totalHits: number }> = [];
  let webhookErrors: Array<{ eventType: string; error: string; receivedAt: string }> = [];

  try {
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const [
      submissionsRes,
      reportsRes,
      sessionsRes,
      paymentsRes,
      analyticsRes,
      rateLimitRes,
      webhookRes,
    ] = await Promise.all([
      supabaseFetch("/rest/v1/survey_submission?select=id,status,created_date_time", {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch("/rest/v1/personal_report?select=id,created_date_time", {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch("/rest/v1/report_session?select=personal_report_id", {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch("/rest/v1/payment?select=id,status,payment_date_time", {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch("/rest/v1/analytics_event?select=id,event_time,event_type", {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/rate_limits?select=key,hits,updated_at&updated_at=gte.${since24h}`, {
        headers: { Range: "0-999" },
      }),
      supabaseFetch(
        "/rest/v1/payment_webhook_event?select=id,event_type,processing_error,received_at&processing_error=not.is.null&order=received_at.desc&limit=20"
      ),
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
      const payments = (await paymentsRes.json()) as Array<{ id: number; status: string }>;
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
      const analyticsEvents = (await analyticsRes.json()) as Array<{ id: number }>;
      analyticsEventCount = analyticsEvents.length;
      integrations.push({
        name: "Analytics Events",
        status: analyticsEventCount > 0 ? "healthy" : "degraded",
        detail:
          analyticsEventCount > 0
            ? `${analyticsEventCount} analytics events captured`
            : "No analytics events captured",
      });
    }

    if (rateLimitRes.ok) {
      const rows = (await rateLimitRes.json()) as Array<{ key: string; hits: number }>;
      const bucketMap: Record<string, number> = {};
      for (const row of rows) {
        bucketMap[row.key] = (bucketMap[row.key] || 0) + row.hits;
      }
      rateLimitHits = Object.entries(bucketMap)
        .map(([bucket, totalHits]) => ({ bucket, totalHits }))
        .sort((left, right) => right.totalHits - left.totalHits);
    }

    if (webhookRes.ok) {
      const rows = (await webhookRes.json()) as Array<{
        event_type: string;
        processing_error: string;
        received_at: string;
      }>;
      webhookErrors = rows.map((row) => ({
        eventType: row.event_type,
        error: row.processing_error,
        receivedAt: row.received_at,
      }));
    }
  } catch (err) {
    logger.warn({ err }, "Health status: failed to compute trust and integration layers");
  }

  const healthyCount = services.filter((service) => service.status === "healthy").length;
  const overallStatus =
    healthyCount === services.length
      ? "healthy"
      : healthyCount >= services.length / 2
        ? "degraded"
        : "down";

  const trackingCoverage: AdminTrackingCoverageItem[] = [
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
  ];

  const trustLayers = [
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
  ];

  const guardrails: AdminHealthGuardrail[] = [
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
      status: scoringSuccessRate >= 95 ? "healthy" : scoringSuccessRate >= 80 ? "degraded" : "down",
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
  ];

  const trackingCoverageRate =
    submissionsCount > 0 ? (analyticsEventCount / submissionsCount) * 100 : 0;
  const reportSessionCoverageRate = reportCount > 0 ? (reportViewedCount / reportCount) * 100 : 0;
  const slos: AdminHealthSlo[] = [
    {
      key: "supabase_latency",
      label: "Supabase Read Latency",
      owner: "tech",
      status:
        supabaseLatencyMs == null
          ? "down"
          : supabaseLatencyMs <= 1200
            ? "healthy"
            : supabaseLatencyMs <= 2000
              ? "degraded"
              : "down",
      objective: "<= 1200ms",
      current: supabaseLatencyMs == null ? "Unavailable" : `${supabaseLatencyMs}ms`,
      errorBudgetRemaining:
        supabaseLatencyMs == null ? 0 : lowerIsBetterBudget(supabaseLatencyMs, 1200, 2000),
      measurementWindow: "Latest probe",
      detail: "Primary admin read dependency used across internal dashboards.",
      href: "/admin/health",
    },
    {
      key: "scoring_coverage",
      label: "Scoring Coverage",
      owner: "tech",
      status: scoringSuccessRate >= 95 ? "healthy" : scoringSuccessRate >= 80 ? "degraded" : "down",
      objective: ">= 95%",
      current: `${scoringSuccessRate}%`,
      errorBudgetRemaining: higherIsBetterBudget(scoringSuccessRate, 95, 80),
      measurementWindow: "Current completed submission base",
      detail: "Completed submissions that successfully reach scoring output.",
      href: "/admin/scoring",
    },
    {
      key: "pipeline_freshness",
      label: "Submission Freshness",
      owner: "tech",
      status:
        pipelineFreshnessHours == null
          ? "degraded"
          : pipelineFreshnessHours <= 24
            ? "healthy"
            : pipelineFreshnessHours <= 72
              ? "degraded"
              : "down",
      objective: "<= 24h",
      current:
        pipelineFreshnessHours == null ? "Unknown" : `${pipelineFreshnessHours}h since last event`,
      errorBudgetRemaining:
        pipelineFreshnessHours == null ? 50 : lowerIsBetterBudget(pipelineFreshnessHours, 24, 72),
      measurementWindow: "Latest submission event",
      detail: "Shows whether the ingestion pipeline is still receiving live traffic.",
      href: "/admin/submissions",
    },
    {
      key: "survey_start_tracking",
      label: "Survey Start Tracking Coverage",
      owner: "growth",
      status:
        trackingCoverageRate >= 95 ? "healthy" : trackingCoverageRate >= 75 ? "degraded" : "down",
      objective: ">= 95%",
      current: `${Math.round(trackingCoverageRate)}%`,
      errorBudgetRemaining: higherIsBetterBudget(trackingCoverageRate, 95, 75),
      measurementWindow: "Current submission window",
      detail: "Compares survey starts with captured analytics events.",
      href: "/admin/health",
    },
    {
      key: "report_session_capture",
      label: "Report Session Capture",
      owner: "product",
      status:
        reportSessionCoverageRate >= 50
          ? "healthy"
          : reportSessionCoverageRate >= 25
            ? "degraded"
            : "down",
      objective: ">= 50%",
      current: `${Math.round(reportSessionCoverageRate)}%`,
      errorBudgetRemaining: higherIsBetterBudget(reportSessionCoverageRate, 50, 25),
      measurementWindow: "Current report base",
      detail: "Generated reports that have at least one tracked viewing session.",
      href: "/admin/reports",
    },
  ];

  const performanceHotspots: AdminPerformanceHotspot[] = [];

  for (const service of services) {
    if (service.status === "healthy") continue;
    performanceHotspots.push({
      title: service.name,
      category: "service",
      severity: service.status === "down" ? "risk" : "watch",
      value: service.latencyMs != null ? `${service.latencyMs}ms` : service.status,
      detail: service.detail,
      href: "/admin/health",
      owner: "tech",
    });
  }

  for (const item of trackingCoverage) {
    if (item.status === "healthy") continue;
    performanceHotspots.push({
      title: `${item.event} coverage`,
      category: "tracking",
      severity: item.status === "down" ? "risk" : "watch",
      value: `${item.actual}/${item.expected}`,
      detail: item.detail,
      href: "/admin/health",
      owner: "growth",
    });
  }

  for (const guardrail of guardrails) {
    if (guardrail.status === "healthy") continue;
    performanceHotspots.push({
      title: guardrail.label,
      category: "guardrail",
      severity: guardrail.status === "down" ? "risk" : "watch",
      value: `${guardrail.current}/${guardrail.target}`,
      detail: guardrail.detail,
      href: guardrail.href,
      owner: guardrail.label === "Scoring Coverage" ? "tech" : "product",
    });
  }

  for (const layer of trustLayers) {
    if (!layer.warning) continue;
    performanceHotspots.push({
      title: `${layer.source} trust`,
      category: "trust",
      severity: layer.sampleSize === 0 ? "risk" : "watch",
      value: `${layer.mode} • ${layer.sampleSize} rows`,
      detail: layer.warning,
      href: "/admin/health",
      owner: "tech",
    });
  }

  const topRateLimitBucket = rateLimitHits[0];
  if (topRateLimitBucket && topRateLimitBucket.totalHits >= 50) {
    performanceHotspots.push({
      title: `Rate limit pressure: ${topRateLimitBucket.bucket}`,
      category: "rate-limit",
      severity: topRateLimitBucket.totalHits >= 150 ? "risk" : "watch",
      value: `${topRateLimitBucket.totalHits} hits / 24h`,
      detail: "This bucket is absorbing the highest request pressure in the last 24 hours.",
      href: "/admin/health",
      owner: "tech",
    });
  }

  if (webhookErrors.length > 0) {
    performanceHotspots.push({
      title: "Webhook processing failures",
      category: "webhook",
      severity: webhookErrors.length >= 5 ? "risk" : "watch",
      value: `${webhookErrors.length} recent failures`,
      detail: webhookErrors[0]?.error ?? "Recent payment webhook processing errors detected.",
      href: "/admin/health",
      owner: "tech",
    });
  }

  performanceHotspots.sort((left, right) => {
    const severityWeight = left.severity === right.severity ? 0 : left.severity === "risk" ? -1 : 1;
    if (severityWeight !== 0) return severityWeight;
    return left.title.localeCompare(right.title);
  });

  return {
    overallStatus,
    services,
    integrations,
    trackingCoverage,
    trustLayers,
    guardrails,
    slos,
    performanceHotspots: performanceHotspots.slice(0, 8),
    checkedAt: now,
  };
}
