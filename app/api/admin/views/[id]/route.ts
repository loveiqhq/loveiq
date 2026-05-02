import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

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
    bucket: "admin-views-write",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { id } = await params;
  const viewId = parseInt(id, 10);
  if (isNaN(viewId) || viewId < 1) {
    return NextResponse.json({ error: "Invalid view ID." }, { status: 400 });
  }

  // Only owner can delete
  const checkRes = await supabaseFetch(
    `/rest/v1/admin_saved_view?id=eq.${viewId}&select=admin_email`
  );
  if (!checkRes.ok) {
    return NextResponse.json({ error: "Unable to verify view." }, { status: 500 });
  }
  const views = (await checkRes.json()) as Array<{ admin_email: string }>;
  if (views.length === 0) {
    return NextResponse.json({ error: "View not found." }, { status: 404 });
  }
  if (views[0].admin_email !== admin.email) {
    return NextResponse.json({ error: "You can only delete your own views." }, { status: 403 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/admin_saved_view?id=eq.${viewId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "View deletion failed");
      return NextResponse.json({ error: "Unable to delete view." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "View deletion error");
    return NextResponse.json({ error: "Unable to delete view." }, { status: 500 });
  }
}
