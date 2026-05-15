import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);
const reviewStatusSchema = z.enum([
  "requested",
  "in-review",
  "approved",
  "changes-requested",
  "rejected",
]);
const impactLevelSchema = z.enum(["low", "medium", "high", "critical"]);

const updateSchema = z
  .object({
    status: reviewStatusSchema.optional(),
    reviewer_email: z.string().trim().email().optional().nullable(),
    decision_note: z.string().trim().max(2000).optional().nullable(),
    due_date: dateString.optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
    impact_level: impactLevelSchema.optional(),
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
    bucket: "admin-review-queue-update",
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

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.status !== undefined) {
    payload.status = parsed.data.status;
    payload.reviewed_at =
      parsed.data.status === "approved" ||
      parsed.data.status === "changes-requested" ||
      parsed.data.status === "rejected"
        ? new Date().toISOString()
        : null;
  }
  if (parsed.data.reviewer_email !== undefined) {
    payload.reviewer_email = parsed.data.reviewer_email ?? null;
  }
  if (parsed.data.decision_note !== undefined) {
    payload.decision_note = parsed.data.decision_note ?? null;
  }
  if (parsed.data.due_date !== undefined) payload.due_date = parsed.data.due_date ?? null;
  if (parsed.data.description !== undefined) payload.description = parsed.data.description ?? null;
  if (parsed.data.impact_level !== undefined) payload.impact_level = parsed.data.impact_level;

  try {
    const res = await supabaseFetch(`/rest/v1/admin_review_request?id=eq.${numericId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.error({ status: res.status, id: numericId }, "Review queue update failed");
      return NextResponse.json({ error: "Unable to update review request." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "update_review_request",
      resource_type: "admin_review_request",
      resource_id: String(numericId),
      metadata: { fields: Object.keys(payload).filter((key) => key !== "updated_at") },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, id: numericId }, "Review queue PATCH error");
    return NextResponse.json({ error: "Unable to update review request." }, { status: 500 });
  }
}
