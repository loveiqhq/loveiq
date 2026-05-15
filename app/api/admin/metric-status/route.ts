import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import { buildMetricStatusSnapshot } from "@features/admin/server/metric-status";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const upsertSchema = z.object({
  action: z.literal("upsert"),
  metric_key: z.string().trim().min(1).max(80),
  status_state: z.enum(["on-track", "watch", "off-track", "critical"]),
  status_reason: z.string().trim().max(1000).optional().nullable(),
  owner_email: z.string().trim().email().optional().nullable(),
  review_due_at: z.string().trim().optional().nullable(),
  leading_indicator_key: z.string().trim().max(80).optional().nullable(),
  leading_indicator_note: z.string().trim().max(500).optional().nullable(),
});

const reviewSchema = z.object({
  action: z.literal("review"),
  metric_key: z.string().trim().min(1).max(80),
});

const postSchema = z.discriminatedUnion("action", [upsertSchema, reviewSchema]);

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
    bucket: "admin-metric-status",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") || "30", 10);

  try {
    return NextResponse.json(await buildMetricStatusSnapshot(rawDays));
  } catch (err) {
    logger.error({ err }, "Metric status GET error");
    return NextResponse.json({ error: "Unable to load metric status." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "editor")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-metric-status-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    if (parsed.data.action === "review") {
      const res = await supabaseFetch(
        `/rest/v1/admin_metric_status?metric_key=eq.${encodeURIComponent(parsed.data.metric_key)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            last_reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        }
      );

      if (!res.ok) {
        logger.error({ status: res.status }, "Metric status review failed");
        return NextResponse.json(
          { error: "Unable to mark metric status as reviewed." },
          { status: 500 }
        );
      }

      await logAdminAction({
        admin_email: admin.email,
        action: "review_metric_status",
        resource_type: "admin_metric_status",
        resource_id: parsed.data.metric_key,
        metadata: { metric_key: parsed.data.metric_key },
        ip,
      });

      return NextResponse.json({ success: true });
    }

    const existingRes = await supabaseFetch(
      `/rest/v1/admin_metric_status?select=id&metric_key=eq.${encodeURIComponent(parsed.data.metric_key)}&limit=1`
    );
    const existing = existingRes.ok
      ? (((await existingRes.json()) as Array<{ id: number }>)[0] ?? null)
      : null;

    const payload = {
      admin_email: admin.email,
      metric_key: parsed.data.metric_key,
      status_state: parsed.data.status_state,
      status_reason: parsed.data.status_reason ?? null,
      owner_email: parsed.data.owner_email ?? null,
      review_due_at: parsed.data.review_due_at ?? null,
      leading_indicator_key: parsed.data.leading_indicator_key ?? null,
      leading_indicator_note: parsed.data.leading_indicator_note ?? null,
      updated_at: new Date().toISOString(),
    };

    const res = existing
      ? await supabaseFetch(`/rest/v1/admin_metric_status?id=eq.${existing.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        })
      : await supabaseFetch("/rest/v1/admin_metric_status", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      logger.error({ status: res.status }, "Metric status upsert failed");
      return NextResponse.json({ error: "Unable to save metric status." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: existing ? "update_metric_status" : "create_metric_status",
      resource_type: "admin_metric_status",
      resource_id: parsed.data.metric_key,
      metadata: { metric_key: parsed.data.metric_key, status_state: parsed.data.status_state },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Metric status POST error");
    return NextResponse.json(
      { error: "Unable to process metric status request." },
      { status: 500 }
    );
  }
}
