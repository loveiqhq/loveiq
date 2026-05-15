import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-audit",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const adminFilter = url.searchParams.get("admin") || "";
  const action = url.searchParams.get("action") || "";
  const resourceType = url.searchParams.get("resourceType") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  const offset = (page - 1) * limit;

  let query =
    "/rest/v1/admin_audit_log?select=id,admin_email,action,resource_type,resource_id,metadata,ip,created_at&order=created_at.desc";

  if (adminFilter) query += `&admin_email=eq.${encodeURIComponent(adminFilter)}`;
  if (action) query += `&action=eq.${encodeURIComponent(action)}`;
  if (resourceType) query += `&resource_type=eq.${encodeURIComponent(resourceType)}`;
  if (dateFrom) query += `&created_at=gte.${encodeURIComponent(dateFrom)}`;
  if (dateTo) query += `&created_at=lte.${encodeURIComponent(dateTo)}`;

  try {
    const res = await supabaseFetch(query, {
      headers: {
        Prefer: "count=exact",
        Range: `${offset}-${offset + limit - 1}`,
      },
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin audit log query failed");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const total = parseInt(res.headers.get("content-range")?.split("/")[1] || "0", 10);
    const entries = (await res.json()) as Array<{
      id: number;
      admin_email: string;
      action: string;
      resource_type: string;
      resource_id: string | null;
      metadata: Record<string, unknown> | null;
      ip: string | null;
      created_at: string;
    }>;

    return NextResponse.json({ entries, total, page, limit });
  } catch (err) {
    logger.error({ err }, "Admin audit log error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
