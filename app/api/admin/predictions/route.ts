import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface Insight {
  type: string;
  title: string;
  description: string;
  confidence: "high" | "medium" | "low";
  metric_value: number;
  comparison_value: number;
  trend: "up" | "down" | "stable";
  priority: number;
}

const CONFIDENCE_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

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
    bucket: "admin-predictions",
    limit: 15,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") || "30", 10);
  const days = Math.min(Math.max(isNaN(rawDays) ? 30 : rawDays, 7), 90);

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_predictive_insights", {
      method: "POST",
      body: JSON.stringify({ p_days: days }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin predictions: Supabase RPC failed");
      return NextResponse.json({ error: "Unable to load predictions." }, { status: 500 });
    }

    const raw = await res.json();
    const insights: Insight[] = Array.isArray(raw) ? raw : [];

    // Sort by priority ascending (1=highest), then confidence (high > medium > low)
    insights.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (CONFIDENCE_ORDER[a.confidence] ?? 2) - (CONFIDENCE_ORDER[b.confidence] ?? 2);
    });

    return NextResponse.json({ insights, days });
  } catch (err) {
    logger.error({ err }, "Admin predictions error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
