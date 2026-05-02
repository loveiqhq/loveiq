import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

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
    bucket: "admin-comparisons-correlation",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_archetype_correlation", {
      method: "POST",
      body: JSON.stringify({ since_ts: since }),
    });

    if (!res.ok) {
      logger.error("Comparisons correlation: Supabase RPC failed");
      return NextResponse.json({ error: "Unable to load correlation data." }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    logger.error({ err }, "Comparisons correlation error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
