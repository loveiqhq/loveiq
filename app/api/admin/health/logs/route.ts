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
  if (!hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-health-logs",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    // Rate limit hit counts from rate_limit table
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const rateLimitRes = await supabaseFetch(
      `/rest/v1/rate_limit?select=bucket,count&updated_at=gte.${since24h}`,
      { headers: { Range: "0-999" } }
    );

    let rateLimitHits: Array<{ bucket: string; totalHits: number }> = [];
    if (rateLimitRes.ok) {
      const rows = (await rateLimitRes.json()) as Array<{ bucket: string; count: number }>;
      const bucketMap: Record<string, number> = {};
      for (const r of rows) {
        bucketMap[r.bucket] = (bucketMap[r.bucket] || 0) + r.count;
      }
      rateLimitHits = Object.entries(bucketMap)
        .map(([bucket, totalHits]) => ({ bucket, totalHits }))
        .sort((a, b) => b.totalHits - a.totalHits);
    }

    // Webhook event processing errors
    const webhookRes = await supabaseFetch(
      `/rest/v1/payment_webhook_event?select=id,event_type,processing_error,received_at&processing_error=not.is.null&order=received_at.desc&limit=20`
    );

    let webhookErrors: Array<{ eventType: string; error: string; receivedAt: string }> = [];
    if (webhookRes.ok) {
      const rows = await webhookRes.json();
      webhookErrors = rows.map(
        (r: { event_type: string; processing_error: string; received_at: string }) => ({
          eventType: r.event_type,
          error: r.processing_error,
          receivedAt: r.received_at,
        })
      );
    }

    return NextResponse.json({
      rateLimitHits,
      webhookErrors,
      period: "24h",
    });
  } catch (err) {
    logger.error({ err }, "Health logs error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
