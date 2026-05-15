import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    bucket: "admin-annotations-write",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { id } = await params;
  const annotationId = parseInt(id, 10);
  if (isNaN(annotationId) || annotationId < 1) {
    return NextResponse.json({ error: "Invalid annotation ID." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/admin_chart_annotation?id=eq.${annotationId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Unable to delete annotation." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Annotation deletion error");
    return NextResponse.json({ error: "Unable to delete annotation." }, { status: 500 });
  }
}
