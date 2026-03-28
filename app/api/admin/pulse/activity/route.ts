import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { maskEmail } from "@/lib/admin/format";
import logger from "@/lib/logger";

/** Extract utm_source from a JSON utm field, falling back to the raw value. */
function parseUtmSource(utm: string | null, fallback = "Direct"): string {
  if (!utm?.trim()) return fallback;
  try {
    const parsed = JSON.parse(utm);
    return parsed.utm_source || fallback;
  } catch {
    return utm.trim();
  }
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
    bucket: "admin-pulse-activity",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since") || new Date(Date.now() - 86_400_000).toISOString();
  const limitParam = url.searchParams.get("limit") || "50";
  const limitNum = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200);

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_recent_activity", {
      method: "POST",
      body: JSON.stringify({ since_ts: since, limit_n: limitNum }),
    });

    if (!res.ok) {
      logger.error("Admin pulse activity: Supabase RPC failed");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }

    const events = (await res.json()) as Array<{
      event_type: string;
      event_time: string;
      email: string | null;
      utm: string | null;
      detail: string | null;
    }>;

    // Mask all emails and parse UTM before returning
    const masked = events.map((e) => ({
      ...e,
      email: e.email ? maskEmail(e.email) : null,
      utm: parseUtmSource(e.utm),
    }));

    return NextResponse.json(masked);
  } catch (err) {
    logger.error({ err }, "Admin pulse activity error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
