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
    bucket: "admin-export-presets-write",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { id } = await params;
  const presetId = parseInt(id, 10);
  if (isNaN(presetId) || presetId < 1) {
    return NextResponse.json({ error: "Invalid preset ID." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_export_preset?id=eq.${presetId}&admin_email=eq.${encodeURIComponent(admin.email)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Unable to delete preset." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Export preset deletion error");
    return NextResponse.json({ error: "Unable to delete preset." }, { status: 500 });
  }
}
