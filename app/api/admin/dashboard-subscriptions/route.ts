import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import {
  DASHBOARD_SUBSCRIPTION_OPTIONS,
  fetchDashboardSubscriptions,
} from "@features/admin/server/dashboard-subscriptions";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const dashboardKeys = new Set(DASHBOARD_SUBSCRIPTION_OPTIONS.map((item) => item.key));

const createSchema = z.object({
  dashboard_key: z.string().trim().min(1).max(80),
  audience_role: z.enum(["leadership", "strategy", "product", "growth", "tech", "ops", "research"]),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  subscriber_emails: z.array(z.string().trim().email()).min(1).max(20),
  linked_metric_key: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

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
    bucket: "admin-dashboard-subscriptions",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const [subscriptions, adminsRes] = await Promise.all([
      fetchDashboardSubscriptions(),
      supabaseFetch("/rest/v1/admin_users?select=email,role&order=email.asc", {
        headers: { Range: "0-99" },
      }),
    ]);

    const admins = adminsRes.ok
      ? ((await adminsRes.json()) as Array<{ email: string; role: string }>).map((entry) => ({
          email: entry.email,
          role: entry.role,
        }))
      : [];

    return NextResponse.json({
      subscriptions,
      dashboards: DASHBOARD_SUBSCRIPTION_OPTIONS,
      admins,
      summary: {
        active: subscriptions.filter((entry) => entry.is_active).length,
        dashboardsCovered: new Set(
          subscriptions.filter((entry) => entry.is_active).map((entry) => entry.dashboard_key)
        ).size,
        audiences: new Set(
          subscriptions.filter((entry) => entry.is_active).map((entry) => entry.audience_role)
        ).size,
      },
    });
  } catch (err) {
    logger.error({ err }, "Dashboard subscriptions GET error");
    return NextResponse.json({ error: "Unable to load dashboard subscriptions." }, { status: 500 });
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
    bucket: "admin-dashboard-subscriptions-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !dashboardKeys.has(parsed.data.dashboard_key)) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const dashboard = DASHBOARD_SUBSCRIPTION_OPTIONS.find(
    (item) => item.key === parsed.data.dashboard_key
  );
  if (!dashboard) {
    return NextResponse.json({ error: "Unknown dashboard." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch("/rest/v1/admin_dashboard_subscription", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        admin_email: admin.email,
        dashboard_key: dashboard.key,
        dashboard_label: dashboard.label,
        audience_role: parsed.data.audience_role,
        cadence: parsed.data.cadence,
        subscriber_emails: parsed.data.subscriber_emails,
        linked_metric_key: parsed.data.linked_metric_key ?? null,
        note: parsed.data.note ?? null,
        is_active: true,
      }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Dashboard subscription create failed");
      return NextResponse.json(
        { error: "Unable to create dashboard subscription." },
        { status: 500 }
      );
    }

    const created = (await res.json()) as Array<{ id: number }>;
    await logAdminAction({
      admin_email: admin.email,
      action: "create_dashboard_subscription",
      resource_type: "admin_dashboard_subscription",
      resource_id: String(created[0]?.id ?? ""),
      metadata: {
        dashboard_key: dashboard.key,
        audience_role: parsed.data.audience_role,
        cadence: parsed.data.cadence,
      },
      ip,
    });

    return NextResponse.json({ success: true, id: created[0]?.id ?? null });
  } catch (err) {
    logger.error({ err }, "Dashboard subscriptions POST error");
    return NextResponse.json(
      { error: "Unable to create dashboard subscription." },
      { status: 500 }
    );
  }
}
