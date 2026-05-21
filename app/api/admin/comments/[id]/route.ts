import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

const updateSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

type CommentOwnershipRow = {
  admin_email: string;
  resource_type: string;
  resource_id: number;
};

async function loadComment(commentId: number) {
  const res = await supabaseFetch(
    `/rest/v1/admin_resource_comment?id=eq.${commentId}&select=admin_email,resource_type,resource_id`
  );
  if (!res.ok) {
    return { row: null, status: 500 };
  }
  const rows = (await res.json()) as CommentOwnershipRow[];
  return { row: rows[0] ?? null, status: rows.length > 0 ? 200 : 404 };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId < 1) {
    return NextResponse.json({ error: "Invalid comment ID." }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-comments-write",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const existing = await loadComment(numericId);
  if (existing.status === 404 || !existing.row) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
  if (existing.status !== 200) {
    return NextResponse.json({ error: "Unable to verify comment." }, { status: 500 });
  }
  if (existing.row.admin_email !== admin.email) {
    return NextResponse.json({ error: "You can only edit your own comments." }, { status: 403 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/admin_resource_comment?id=eq.${numericId}`, {
      method: "PATCH",
      body: JSON.stringify({
        content: parsed.data.content,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      logger.error({ status: res.status, id: numericId }, "Admin comment update failed");
      return NextResponse.json({ error: "Unable to update comment." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "update_resource_comment",
      resource_type: "admin_resource_comment",
      resource_id: String(numericId),
      metadata: {
        target_resource_type: existing.row.resource_type,
        target_resource_id: existing.row.resource_id,
      },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin comments PATCH error");
    return NextResponse.json({ error: "Unable to update comment." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId < 1) {
    return NextResponse.json({ error: "Invalid comment ID." }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-comments-write",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const existing = await loadComment(numericId);
  if (existing.status === 404 || !existing.row) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
  if (existing.status !== 200) {
    return NextResponse.json({ error: "Unable to verify comment." }, { status: 500 });
  }
  if (existing.row.admin_email !== admin.email && !hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/admin_resource_comment?id=eq.${numericId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      logger.error({ status: res.status, id: numericId }, "Admin comment delete failed");
      return NextResponse.json({ error: "Unable to delete comment." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "delete_resource_comment",
      resource_type: "admin_resource_comment",
      resource_id: String(numericId),
      metadata: {
        target_resource_type: existing.row.resource_type,
        target_resource_id: existing.row.resource_id,
      },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin comments DELETE error");
    return NextResponse.json({ error: "Unable to delete comment." }, { status: 500 });
  }
}
