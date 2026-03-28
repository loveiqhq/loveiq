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
    bucket: "admin-funnels-conversion",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const utm = url.searchParams.get("utm") || "";

  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_conversion_funnel", {
      method: "POST",
      body: JSON.stringify({ since_ts: since, utm_filter: utm || null }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin funnels conversion query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    logger.error({ err }, "Admin funnels conversion error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
