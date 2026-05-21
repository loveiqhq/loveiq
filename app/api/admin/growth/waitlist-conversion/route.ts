import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface RpcTimeBucket {
  bucket: string;
  count: number;
}

interface RpcArchetypeConversion {
  archetype: string;
  count: number;
}

interface RpcResult {
  total_waitlist: number;
  converted: number;
  conversion_pct: number;
  avg_hours_to_convert: number | null;
  funnel: {
    waitlist_total: number;
    mapped_to_user: number;
    completed: number;
    scored: number;
  };
  time_to_convert: RpcTimeBucket[];
  conversion_by_archetype: RpcArchetypeConversion[];
}

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
    bucket: "admin-growth-waitlist",
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
    const res = await supabaseFetch("/rest/v1/rpc/get_waitlist_conversion", {
      method: "POST",
      body: JSON.stringify({ since_ts: since }),
    });

    if (!res.ok) {
      logger.error("Growth waitlist conversion: Supabase RPC failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const data = (await res.json()) as RpcResult;

    return NextResponse.json({
      totalWaitlist: data.total_waitlist ?? 0,
      converted: data.converted ?? 0,
      conversionPct: data.conversion_pct ?? 0,
      avgHoursToConvert: data.avg_hours_to_convert ?? null,
      funnel: data.funnel ?? {
        waitlist_total: 0,
        mapped_to_user: 0,
        completed: 0,
        scored: 0,
      },
      timeToConvert: data.time_to_convert ?? [],
      conversionByArchetype: data.conversion_by_archetype ?? [],
    });
  } catch (err) {
    logger.error({ err }, "Growth waitlist conversion error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
