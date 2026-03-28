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
    bucket: "admin-answers-distribution",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 0;
  const archetype = url.searchParams.get("archetype") || null;
  const utm = url.searchParams.get("utm") || null;

  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_full_answer_distribution", {
      method: "POST",
      body: JSON.stringify({
        since_ts: since,
        p_archetype: archetype,
        p_utm: utm,
      }),
    });

    if (!res.ok) {
      logger.error("Admin answers distribution: Supabase RPC failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    logger.error({ err }, "Admin answers distribution error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
