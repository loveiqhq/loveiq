import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
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
    checkedAt: now,
  });
}
