import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import {
  DASHBOARD_SUBSCRIPTION_OPTIONS,
  type DashboardSubscriptionAudience,
  type DashboardSubscriptionCadence,
} from "@features/admin/server/dashboard-subscriptions";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

const dashboardKeys = new Set(DASHBOARD_SUBSCRIPTION_OPTIONS.map((item) => item.key));

const patchSchema = z.object({
  dashboard_key: z.string().trim().min(1).max(80).optional(),
  audience_role: z
    .enum(["leadership", "strategy", "product", "growth", "tech", "ops", "research"])
    .optional(),
  cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
  subscriber_emails: z.array(z.string().trim().email()).min(1).max(20).optional(),
  linked_metric_key: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const params = await context.params;
  const numericId = Number.parseInt(params.id, 10);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid subscription id." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.dashboard_key !== undefined) {
    if (!dashboardKeys.has(parsed.data.dashboard_key)) {
      return NextResponse.json({ error: "Unknown dashboard." }, { status: 400 });
    }
    const dashboard = DASHBOARD_SUBSCRIPTION_OPTIONS.find(
      (item) => item.key === parsed.data.dashboard_key
    );
    patch.dashboard_key = parsed.data.dashboard_key;
    patch.dashboard_label = dashboard?.label ?? parsed.data.dashboard_key;
  }
  if (parsed.data.audience_role !== undefined) {
    patch.audience_role = parsed.data.audience_role as DashboardSubscriptionAudience;
  }
  if (parsed.data.cadence !== undefined) {
    patch.cadence = parsed.data.cadence as DashboardSubscriptionCadence;
  }
  if (parsed.data.subscriber_emails !== undefined) {
    patch.subscriber_emails = parsed.data.subscriber_emails;
  }
  if (parsed.data.linked_metric_key !== undefined) {
    patch.linked_metric_key = parsed.data.linked_metric_key ?? null;
  }
  if (parsed.data.note !== undefined) patch.note = parsed.data.note ?? null;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

  try {
    const res = await supabaseFetch(`/rest/v1/admin_dashboard_subscription?id=eq.${numericId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Dashboard subscription update failed");
      return NextResponse.json(
        { error: "Unable to update dashboard subscription." },
        { status: 500 }
      );
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "update_dashboard_subscription",
      resource_type: "admin_dashboard_subscription",
      resource_id: String(numericId),
      metadata: { fields: Object.keys(patch) },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Dashboard subscription PATCH error");
    return NextResponse.json(
      { error: "Unable to update dashboard subscription." },
      { status: 500 }
    );
  }
}
