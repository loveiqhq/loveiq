import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import { hasRole } from "@features/admin/server/roles";
import { ADMIN_REVIEW_RESOURCE_TYPES } from "@features/admin/server/reviews";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);
const reviewStatusSchema = z.enum([
  "requested",
  "in-review",
  "approved",
  "changes-requested",
  "rejected",
]);
const impactLevelSchema = z.enum(["low", "medium", "high", "critical"]);
const resourceTypeSchema = z.enum(ADMIN_REVIEW_RESOURCE_TYPES);

const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  resource_type: resourceTypeSchema,
  resource_id: z.number().int().positive().optional().nullable(),
  linked_metric_key: z.string().trim().max(80).optional().nullable(),
  impact_level: impactLevelSchema.optional(),
  reviewer_email: z.string().trim().email().optional().nullable(),
  source_href: z.string().trim().max(200).optional().nullable(),
  due_date: dateString.optional().nullable(),
  payload_snapshot: z.record(z.string(), z.unknown()).optional(),
});

type ReviewRow = {
  id: number;
  admin_email: string;
  title: string;
  description: string | null;
  resource_type: z.infer<typeof resourceTypeSchema>;
  resource_id: number | null;
  linked_metric_key: string | null;
  impact_level: z.infer<typeof impactLevelSchema>;
  status: z.infer<typeof reviewStatusSchema>;
  reviewer_email: string | null;
  decision_note: string | null;
  source_href: string | null;
  due_date: string | null;
  payload_snapshot: Record<string, unknown>;
  requested_at: string;
  reviewed_at: string | null;
  updated_at: string;
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
    bucket: "admin-review-queue",
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
      `/rest/v1/admin_review_request?select=*&order=updated_at.desc${filters}`,
      { headers: { Range: "0-199" } }
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "Review queue query failed");
      return NextResponse.json({ error: "Unable to load review queue." }, { status: 500 });
    }

    const items = (await res.json()) as ReviewRow[];
    return NextResponse.json({
      summary: {
        total: items.length,
        requested: items.filter((item) => item.status === "requested").length,
        inReview: items.filter((item) => item.status === "in-review").length,
        approved: items.filter((item) => item.status === "approved").length,
        changesRequested: items.filter((item) => item.status === "changes-requested").length,
        overdue: items.filter(
          (item) =>
            item.due_date != null &&
            item.due_date < new Date().toISOString().slice(0, 10) &&
            item.status !== "approved" &&
            item.status !== "rejected"
        ).length,
      },
      items,
    });
  } catch (err) {
    logger.error({ err }, "Review queue GET error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
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
    bucket: "admin-review-queue-write",
    limit: 25,
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
    const res = await supabaseFetch("/rest/v1/admin_review_request", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        admin_email: admin.email,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        resource_type: parsed.data.resource_type,
        resource_id: parsed.data.resource_id ?? null,
        linked_metric_key: parsed.data.linked_metric_key ?? null,
        impact_level: parsed.data.impact_level ?? "medium",
        reviewer_email: parsed.data.reviewer_email ?? null,
        source_href: parsed.data.source_href ?? null,
        due_date: parsed.data.due_date ?? null,
        payload_snapshot: parsed.data.payload_snapshot ?? {},
      }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Review queue create failed");
      return NextResponse.json({ error: "Unable to create review request." }, { status: 500 });
    }

    const created = (await res.json()) as Array<{ id: number }>;
    await logAdminAction({
      admin_email: admin.email,
      action: "create_review_request",
      resource_type: "admin_review_request",
      resource_id: String(created[0]?.id ?? ""),
      metadata: {
        title: parsed.data.title,
        resource_type: parsed.data.resource_type,
        resource_id: parsed.data.resource_id ?? null,
      },
      ip,
    });

    return NextResponse.json({ success: true, id: created[0]?.id ?? null });
  } catch (err) {
    logger.error({ err }, "Review queue POST error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
