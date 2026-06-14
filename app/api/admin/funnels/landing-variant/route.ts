import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface VariantRow {
  variant: string;
  completed: number;
  paid: number;
  revenue: number;
}

/**
 * White-vs-control landing A/B conversion comparison. Per variant: completed
 * surveys, paid purchases, revenue, and the derived paid rate (paid ÷ completed).
 * Variant attribution is the buyer's submission utm_tracker (source of truth);
 * see the `get_landing_variant_funnel` RPC. Raw visitor/traffic counts live in
 * GA4 (landing exposures aren't persisted server-side); the A/B is ~50/50 so
 * completed volume is a fair top-funnel proxy.
 */
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
    bucket: "admin-funnels-landing-variant",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_landing_variant_funnel", {
      method: "POST",
      body: JSON.stringify({ since_ts: since }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin landing-variant funnel query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const raw = (await res.json()) as VariantRow[];
    const rows = (Array.isArray(raw) ? raw : []).map((r) => ({
      variant: r.variant,
      completed: r.completed,
      paid: r.paid,
      revenue: r.revenue,
      // paid ÷ completed — the monetisation conversion (the money metric).
      paidRate: r.completed > 0 ? Math.round((r.paid / r.completed) * 1000) / 10 : 0,
    }));

    return NextResponse.json({ rows });
  } catch (err) {
    logger.error({ err }, "Admin landing-variant funnel error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
