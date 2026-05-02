import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  status: z.enum(["open", "in-progress", "blocked", "done"]).optional(),
  owner_email: z.string().trim().email().optional().nullable(),
  source_type: z
    .enum(["general", "metric", "decision", "experiment", "release", "investigation"])
    .optional(),
  source_id: z.number().int().positive().optional().nullable(),
  metric_key: z.string().trim().max(80).optional().nullable(),
  expected_impact: z.string().trim().max(1000).optional().nullable(),
  measured_outcome: z.string().trim().max(1000).optional().nullable(),
  linked_href: z.string().trim().max(200).optional().nullable(),
  due_date: dateString.optional().nullable(),
  review_date: dateString.optional().nullable(),
});

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
    bucket: "admin-actions",
    limit: 40,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const filters = status ? `&status=eq.${encodeURIComponent(status)}` : "";
    const res = await supabaseFetch(
      `/rest/v1/admin_action_item?select=*&order=updated_at.desc${filters}`,
      { headers: { Range: "0-99" } }
    );

    if (!res.ok) {
      return NextResponse.json({ items: [] });
    }

    return NextResponse.json({ items: await res.json() });
  } catch (err) {
    logger.error({ err }, "Admin actions GET error");
    return NextResponse.json({ error: "Unable to load action tracker." }, { status: 500 });
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
    bucket: "admin-actions-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const payload = {
      admin_email: admin.email,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority ?? "medium",
      status: parsed.data.status ?? "open",
      owner_email: parsed.data.owner_email ?? null,
      source_type: parsed.data.source_type ?? "general",
      source_id: parsed.data.source_id ?? null,
      metric_key: parsed.data.metric_key ?? null,
      expected_impact: parsed.data.expected_impact ?? null,
      measured_outcome: parsed.data.measured_outcome ?? null,
      linked_href: parsed.data.linked_href ?? null,
      due_date: parsed.data.due_date ?? null,
      review_date: parsed.data.review_date ?? null,
    };

    const res = await supabaseFetch("/rest/v1/admin_action_item", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin action creation failed");
      return NextResponse.json({ error: "Unable to create action item." }, { status: 500 });
    }

    const created = (await res.json()) as Array<{ id: number }>;
    await logAdminAction({
      admin_email: admin.email,
      action: "create_action_item",
      resource_type: "admin_action_item",
      resource_id: String(created[0]?.id ?? ""),
      metadata: {
        title: payload.title,
        priority: payload.priority,
        source_type: payload.source_type,
      },
      ip,
    });

    return NextResponse.json({ success: true, id: created[0]?.id ?? null });
  } catch (err) {
    logger.error({ err }, "Admin actions POST error");
    return NextResponse.json({ error: "Unable to create action item." }, { status: 500 });
  }
}
