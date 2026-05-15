import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const updateSchema = z
  .object({
    label: z.string().trim().min(3).max(120).optional(),
    owner_email: z.string().trim().email().optional().nullable(),
    comparator: z.enum(["gte", "lte", "eq"]).optional(),
    threshold_numeric: z.number().finite().optional(),
    severity: z.enum(["watch", "risk"]).optional(),
    linked_href: z.string().trim().max(200).optional().nullable(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field must be updated.");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-alerts-update",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/admin_alert_rule?id=eq.${numericId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      logger.error({ status: res.status, id: numericId }, "Alert rule update failed");
      return NextResponse.json({ error: "Unable to update alert policy." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "update_alert_rule",
      resource_type: "admin_alert_rule",
      resource_id: String(numericId),
      metadata: { fields: Object.keys(parsed.data) },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, id: numericId }, "Admin alerts PATCH error");
    return NextResponse.json({ error: "Unable to update alert policy." }, { status: 500 });
  }
}
