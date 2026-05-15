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
  if (!hasRole(admin.role, "viewer")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-kpis-discrimination",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : null;

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_question_discrimination", {
      method: "POST",
      body: JSON.stringify({ since_ts: since }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Discrimination RPC failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ questions: data });
  } catch (err) {
    logger.error({ err }, "Discrimination error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
