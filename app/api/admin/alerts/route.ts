import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { fetchAlertRules } from "@/lib/admin/alerts";
import { logAdminAction } from "@/lib/admin/audit";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const createSchema = z.object({
  label: z.string().trim().min(3).max(120),
  owner_email: z.string().trim().email().optional().nullable(),
  target_type: z.enum(["guardrail", "service", "trust", "action", "decision"]),
  target_key: z.string().trim().min(2).max(80),
  comparator: z.enum(["gte", "lte", "eq"]),
  threshold_numeric: z.number().finite(),
  severity: z.enum(["watch", "risk"]),
  linked_href: z.string().trim().max(200).optional().nullable(),
  is_active: z.boolean().optional(),
});

const AVAILABLE_TARGETS = [
  {
    type: "guardrail",
    key: "completion_rate",
    label: "Completion Rate",
    href: "/admin/product-kpis",
  },
  { type: "guardrail", key: "scoring_coverage", label: "Scoring Coverage", href: "/admin/scoring" },
  { type: "guardrail", key: "report_view_rate", label: "Report View Rate", href: "/admin/reports" },
  { type: "service", key: "supabase", label: "Supabase latency/status", href: "/admin/health" },
  { type: "service", key: "scoring_engine", label: "Scoring engine status", href: "/admin/health" },
  {
    type: "service",
    key: "survey_pipeline",
    label: "Survey pipeline freshness",
    href: "/admin/health",
  },
  {
    type: "trust",
    key: "survey_submission_freshness_hours",
    label: "Survey freshness",
    href: "/admin/health",
  },
  {
    type: "trust",
    key: "scoring_result_freshness_hours",
    label: "Scoring freshness",
    href: "/admin/health",
  },
  {
    type: "trust",
    key: "analytics_event_freshness_hours",
    label: "Analytics freshness",
    href: "/admin/health",
  },
  { type: "action", key: "blocked_actions", label: "Blocked actions", href: "/admin" },
  { type: "action", key: "overdue_actions", label: "Overdue actions", href: "/admin" },
  {
    type: "decision",
    key: "pending_experiment_decisions",
    label: "Pending experiment decisions",
    href: "/admin/experiments",
  },
  {
    type: "decision",
    key: "stale_decision_reviews",
    label: "Stale decision reviews",
    href: "/admin/changelog",
  },
] as const;

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-alerts",
    limit: 40,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    return NextResponse.json({
      rules: await fetchAlertRules(),
      targets: AVAILABLE_TARGETS,
    });
  } catch (err) {
    logger.error({ err }, "Admin alerts GET error");
    return NextResponse.json({ error: "Unable to load alert policies." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "editor")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-alerts-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const payload = {
      admin_email: admin.email,
      owner_email: parsed.data.owner_email ?? null,
      label: parsed.data.label,
      target_type: parsed.data.target_type,
      target_key: parsed.data.target_key,
      comparator: parsed.data.comparator,
      threshold_numeric: parsed.data.threshold_numeric,
      severity: parsed.data.severity,
      linked_href: parsed.data.linked_href ?? null,
      is_active: parsed.data.is_active ?? true,
    };

    const res = await supabaseFetch("/rest/v1/admin_alert_rule", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "Alert rule creation failed");
      return NextResponse.json({ error: "Unable to create alert policy." }, { status: 500 });
    }

    const created = (await res.json()) as Array<{ id: number }>;
    await logAdminAction({
      admin_email: admin.email,
      action: "create_alert_rule",
      resource_type: "admin_alert_rule",
      resource_id: String(created[0]?.id ?? ""),
      metadata: { target_key: payload.target_key, severity: payload.severity },
      ip,
    });

    return NextResponse.json({ success: true, id: created[0]?.id ?? null });
  } catch (err) {
    logger.error({ err }, "Admin alerts POST error");
    return NextResponse.json({ error: "Unable to create alert policy." }, { status: 500 });
  }
}
