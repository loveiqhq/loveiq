import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const updateSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    summary: z.string().trim().max(2000).optional().nullable(),
    entry_type: z
      .enum([
        "signal",
        "theme",
        "pain-point",
        "contradiction",
        "wording",
        "answer-quality",
        "custom",
      ])
      .optional(),
    status: z.enum(["draft", "active", "validated", "archived"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    owner_email: z.string().trim().email().optional().nullable(),
    primary_metric_key: z.string().trim().max(80).optional().nullable(),
    question_id: z.string().trim().max(40).optional().nullable(),
    theme: z.string().trim().max(120).optional().nullable(),
    source_key: z.string().trim().max(120).optional().nullable(),
    source_href: z.string().trim().max(200).optional().nullable(),
    evidence: z.array(z.string().trim().min(1).max(400)).max(8).optional(),
    recommendation: z.string().trim().max(1500).optional().nullable(),
    linked_action_id: z.number().int().positive().optional().nullable(),
    review_date: dateString.optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field must be updated.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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
    bucket: "admin-research-repository-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const params = await context.params;
  const numericId = Number.parseInt(params.id, 10);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid repository entry id." }, { status: 400 });
  }

  try {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.title !== undefined) payload.title = parsed.data.title;
    if (parsed.data.summary !== undefined) payload.summary = parsed.data.summary ?? null;
    if (parsed.data.entry_type !== undefined) payload.entry_type = parsed.data.entry_type;
    if (parsed.data.status !== undefined) payload.status = parsed.data.status;
    if (parsed.data.priority !== undefined) payload.priority = parsed.data.priority;
    if (parsed.data.owner_email !== undefined)
      payload.owner_email = parsed.data.owner_email ?? null;
    if (parsed.data.primary_metric_key !== undefined) {
      payload.primary_metric_key = parsed.data.primary_metric_key ?? null;
    }
    if (parsed.data.question_id !== undefined)
      payload.question_id = parsed.data.question_id ?? null;
    if (parsed.data.theme !== undefined) payload.theme = parsed.data.theme ?? null;
    if (parsed.data.source_key !== undefined) payload.source_key = parsed.data.source_key ?? null;
    if (parsed.data.source_href !== undefined)
      payload.source_href = parsed.data.source_href ?? null;
    if (parsed.data.evidence !== undefined) payload.evidence = parsed.data.evidence;
    if (parsed.data.recommendation !== undefined) {
      payload.recommendation = parsed.data.recommendation ?? null;
    }
    if (parsed.data.linked_action_id !== undefined) {
      payload.linked_action_id = parsed.data.linked_action_id ?? null;
    }
    if (parsed.data.review_date !== undefined)
      payload.review_date = parsed.data.review_date ?? null;

    const res = await supabaseFetch(`/rest/v1/admin_research_repository_entry?id=eq.${numericId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.error({ status: res.status, id: numericId }, "Research repository update failed");
      return NextResponse.json({ error: "Unable to update repository entry." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "update_admin_research_repository_entry",
      resource_type: "admin_research_repository_entry",
      resource_id: String(numericId),
      metadata: { fields: Object.keys(payload).filter((key) => key !== "updated_at") },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, id: numericId }, "Research repository PATCH error");
    return NextResponse.json({ error: "Unable to update repository entry." }, { status: 500 });
  }
}
