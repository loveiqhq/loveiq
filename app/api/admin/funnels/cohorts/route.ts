import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

const VALID_GROUP_BY = new Set(["week", "utm", "archetype"]);

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
    bucket: "admin-funnels-cohorts",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const groupBy = url.searchParams.get("groupBy") || "week";

  if (!VALID_GROUP_BY.has(groupBy)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_cohort_analysis", {
      method: "POST",
      body: JSON.stringify({ since_ts: since, group_by_field: groupBy }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin funnels cohorts query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    logger.error({ err }, "Admin funnels cohorts error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
