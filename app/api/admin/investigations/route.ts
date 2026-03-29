import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { logAdminAction } from "@/lib/admin/audit";
import logger from "@/lib/logger";

const statusEnum = z.enum([
  "needs-review",
  "root-cause-found",
  "question-change-candidate",
  "monitoring",
  "closed",
]);

const priorityEnum = z.enum(["low", "medium", "high"]);

const createSchema = z.object({
  action: z.literal("create"),
  title: z.string().min(1).max(160),
  summary: z.string().max(4000).optional().nullable(),
  status: statusEnum.default("needs-review"),
  priority: priorityEnum.default("medium"),
  owner_email: z.string().email().optional().nullable(),
  due_date: z.string().optional().nullable(),
  submission_id: z.number().int().positive().optional().nullable(),
  segment_id: z.number().int().positive().optional().nullable(),
});

const updateSchema = z.object({
  action: z.literal("update"),
  caseId: z.number().int().positive(),
  title: z.string().min(1).max(160).optional(),
  summary: z.string().max(4000).optional().nullable(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  owner_email: z.string().email().optional().nullable(),
  due_date: z.string().optional().nullable(),
  submission_id: z.number().int().positive().optional().nullable(),
  segment_id: z.number().int().positive().optional().nullable(),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  caseId: z.number().int().positive(),
});

const postSchema = z.discriminatedUnion("action", [createSchema, updateSchema, deleteSchema]);

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
    bucket: "admin-investigations",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const res = await supabaseFetch(
      "/rest/v1/admin_investigation_case?select=*&order=updated_at.desc",
      { headers: { Range: "0-999" } }
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "Investigations query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const cases = (await res.json()) as Array<{
      id: number;
      title: string;
      summary: string | null;
      status: z.infer<typeof statusEnum>;
      priority: z.infer<typeof priorityEnum>;
      owner_email: string | null;
      due_date: string | null;
      submission_id: number | null;
      segment_id: number | null;
      created_by: string;
      created_at: string;
      updated_at: string;
    }>;

    const today = new Date().toISOString().slice(0, 10);
    const openCases = cases.filter((item) => item.status !== "closed");
    const summary = {
      total: cases.length,
      open: openCases.length,
      overdue: openCases.filter((item) => item.due_date && item.due_date < today).length,
      highPriority: openCases.filter((item) => item.priority === "high").length,
    };

    return NextResponse.json({ cases, summary });
  } catch (err) {
    logger.error({ err }, "Investigations GET error");
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
    bucket: "admin-investigations-write",
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
    if (parsed.data.action === "create") {
      const res = await supabaseFetch("/rest/v1/admin_investigation_case", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          title: parsed.data.title,
          summary: parsed.data.summary ?? null,
          status: parsed.data.status,
          priority: parsed.data.priority,
          owner_email: parsed.data.owner_email ?? null,
          due_date: parsed.data.due_date ?? null,
          submission_id: parsed.data.submission_id ?? null,
          segment_id: parsed.data.segment_id ?? null,
          created_by: admin.email,
        }),
      });

      if (!res.ok) {
        logger.error({ status: res.status }, "Investigation create failed");
        return NextResponse.json({ error: "Unable to create case." }, { status: 500 });
      }

      const rows = (await res.json()) as Array<{ id: number }>;
      await logAdminAction({
        admin_email: admin.email,
        action: "create_investigation_case",
        resource_type: "admin_investigation_case",
        resource_id: String(rows[0]?.id),
        metadata: { title: parsed.data.title },
        ip,
      });

      return NextResponse.json({ success: true, id: rows[0]?.id });
    }

    if (parsed.data.action === "update") {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (parsed.data.title !== undefined) patch.title = parsed.data.title;
      if (parsed.data.summary !== undefined) patch.summary = parsed.data.summary ?? null;
      if (parsed.data.status !== undefined) patch.status = parsed.data.status;
      if (parsed.data.priority !== undefined) patch.priority = parsed.data.priority;
      if (parsed.data.owner_email !== undefined)
        patch.owner_email = parsed.data.owner_email ?? null;
      if (parsed.data.due_date !== undefined) patch.due_date = parsed.data.due_date ?? null;
      if (parsed.data.submission_id !== undefined)
        patch.submission_id = parsed.data.submission_id ?? null;
      if (parsed.data.segment_id !== undefined) patch.segment_id = parsed.data.segment_id ?? null;

      const res = await supabaseFetch(
        `/rest/v1/admin_investigation_case?id=eq.${parsed.data.caseId}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(patch),
        }
      );

      if (!res.ok) {
        logger.error({ status: res.status }, "Investigation update failed");
        return NextResponse.json({ error: "Unable to update case." }, { status: 500 });
      }

      await logAdminAction({
        admin_email: admin.email,
        action: "update_investigation_case",
        resource_type: "admin_investigation_case",
        resource_id: String(parsed.data.caseId),
        metadata: { fields: Object.keys(patch) },
        ip,
      });

      return NextResponse.json({ success: true });
    }

    if (!hasRole(admin.role, "admin")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const res = await supabaseFetch(
      `/rest/v1/admin_investigation_case?id=eq.${parsed.data.caseId}`,
      {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      }
    );

    if (!res.ok) {
      logger.error({ status: res.status }, "Investigation delete failed");
      return NextResponse.json({ error: "Unable to delete case." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "delete_investigation_case",
      resource_type: "admin_investigation_case",
      resource_id: String(parsed.data.caseId),
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Investigations POST error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
