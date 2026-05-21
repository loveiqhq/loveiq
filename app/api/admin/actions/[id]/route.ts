import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const updateSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
    priority: z.enum(["high", "medium", "low"]).optional(),
    status: z.enum(["open", "in-progress", "blocked", "done"]).optional(),
    owner_email: z.string().trim().email().optional().nullable(),
    source_type: z
      .enum(["general", "metric", "decision", "experiment", "release", "investigation"])
      .optional(),
    source_id: z.number().int().positive().optional().nullable(),
    metric_key: z.string().trim().max(80).optional().nullable(),
    expected_impact: z.string().trim().max(1000).optional().nullable(),
    measured_outcome: z.string().trim().max(1000).optional().nullable(),
    linked_href: z.string().trim().max(200).optional().nullable(),
    due_date: dateString.optional().nullable(),
    review_date: dateString.optional().nullable(),
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
    bucket: "admin-actions-update",
    limit: 30,
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
    const payload = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };

    const res = await supabaseFetch(`/rest/v1/admin_action_item?id=eq.${numericId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.error({ status: res.status, id: numericId }, "Admin action update failed");
      return NextResponse.json({ error: "Unable to update action item." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "update_action_item",
      resource_type: "admin_action_item",
      resource_id: String(numericId),
      metadata: { fields: Object.keys(parsed.data) },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, id: numericId }, "Admin actions PATCH error");
    return NextResponse.json({ error: "Unable to update action item." }, { status: 500 });
  }
}
