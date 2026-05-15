import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import {
  type AdminCommentResourceType,
  ADMIN_COMMENT_RESOURCE_TYPES,
} from "@features/admin/server/comments";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const resourceTypeSchema = z.enum(ADMIN_COMMENT_RESOURCE_TYPES);
const createSchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: z.number().int().positive(),
  content: z.string().trim().min(1).max(2000),
});

type CommentRow = {
  id: number;
  admin_email: string;
  resource_type: AdminCommentResourceType;
  resource_id: number;
  content: string;
  created_at: string;
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
    bucket: "admin-comments",
    limit: 50,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const resourceTypeResult = resourceTypeSchema.safeParse(url.searchParams.get("resourceType"));
  const resourceId = Number.parseInt(url.searchParams.get("resourceId") ?? "", 10);
  if (!resourceTypeResult.success || Number.isNaN(resourceId) || resourceId < 1) {
    return NextResponse.json({ error: "Invalid resource." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch(
      `/rest/v1/admin_resource_comment?resource_type=eq.${encodeURIComponent(
        resourceTypeResult.data
      )}&resource_id=eq.${resourceId}&select=id,admin_email,resource_type,resource_id,content,created_at,updated_at&order=created_at.asc`,
      { headers: { Range: "0-199" } }
    );

    if (!res.ok) {
      logger.error(
        { status: res.status, resourceType: resourceTypeResult.data, resourceId },
        "Admin comments query failed"
      );
      return NextResponse.json({ error: "Unable to load discussion." }, { status: 500 });
    }

    const comments = (await res.json()) as CommentRow[];
    return NextResponse.json({
      comments: comments.map((comment) => ({
        ...comment,
        is_mine: comment.admin_email === admin.email,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Admin comments GET error");
    return NextResponse.json({ error: "Unable to load discussion." }, { status: 500 });
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
    bucket: "admin-comments-write",
    limit: 30,
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
    const res = await supabaseFetch("/rest/v1/admin_resource_comment", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        admin_email: admin.email,
        resource_type: parsed.data.resourceType,
        resource_id: parsed.data.resourceId,
        content: parsed.data.content,
      }),
    });

    if (!res.ok) {
      logger.error(
        {
          status: res.status,
          resourceType: parsed.data.resourceType,
          resourceId: parsed.data.resourceId,
        },
        "Admin comment creation failed"
      );
      return NextResponse.json({ error: "Unable to save comment." }, { status: 500 });
    }

    const created = (await res.json()) as Array<{ id: number }>;
    await logAdminAction({
      admin_email: admin.email,
      action: "create_resource_comment",
      resource_type: "admin_resource_comment",
      resource_id: String(created[0]?.id ?? ""),
      metadata: {
        target_resource_type: parsed.data.resourceType,
        target_resource_id: parsed.data.resourceId,
      },
      ip,
    });

    return NextResponse.json({ success: true, id: created[0]?.id ?? null });
  } catch (err) {
    logger.error({ err }, "Admin comments POST error");
    return NextResponse.json({ error: "Unable to save comment." }, { status: 500 });
  }
}
