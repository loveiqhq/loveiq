import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import { logAdminAction } from "@features/admin/server/audit";
import logger from "@shared/observability/logger";

const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
  action: z.enum(["completed", "flagged", "archived"]),
});

export async function PATCH(request: Request) {
  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "editor")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-submissions-bulk",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = bulkSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const { ids, action } = parsed.data;

  try {
    const res = await supabaseFetch(`/rest/v1/survey_submission?id=in.(${ids.join(",")})`, {
      method: "PATCH",
      body: JSON.stringify({ status: action }),
      headers: { Prefer: "return=representation" },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Bulk update failed");
      return NextResponse.json({ error: "Unable to update submissions." }, { status: 500 });
    }

    const updated = (await res.json()) as Array<{ id: number }>;

    logAdminAction({
      admin_email: admin.email,
      action: "bulk_update_status",
      resource_type: "submission",
      resource_id: ids.join(","),
      metadata: { new_status: action, requested: ids.length, updated: updated.length },
      ip,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      updated: updated.length,
      total: ids.length,
    });
  } catch (err) {
    logger.error({ err }, "Bulk update error");
    return NextResponse.json({ error: "Unable to update submissions." }, { status: 500 });
  }
}
