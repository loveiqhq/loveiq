import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import { logAdminAction } from "@features/admin/server/audit";
import logger from "@/lib/logger";
import { z } from "zod";
import { WORKFLOW_TAGS, isWorkflowTagName } from "@features/admin/server/workflow-tags";

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const assignTagSchema = z.object({
  submissionId: z.number().int().positive(),
  tagId: z.number().int().positive(),
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
    bucket: "admin-tags",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const [tagsRes, assignmentsRes] = await Promise.all([
      supabaseFetch(`/rest/v1/submission_tag?select=*&order=name.asc`, {
        headers: { Range: "0-999" },
      }),
      supabaseFetch(`/rest/v1/submission_tag_assignment?select=*&order=assigned_at.desc`, {
        headers: { Range: "0-9999" },
      }),
    ]);

    if (!tagsRes.ok) {
      logger.error("Tags: Supabase query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const tags = (await tagsRes.json()) as Array<{
      id: number;
      name: string;
      color: string;
      created_by: string;
      created_at: string;
    }>;

    const assignments = assignmentsRes.ok
      ? ((await assignmentsRes.json()) as Array<{
          id: number;
          submission_id: number;
          tag_id: number;
          assigned_by: string;
          assigned_at: string;
        }>)
      : [];

    // Group assignments by tag
    const tagUsage: Record<number, number> = {};
    const submissionTags: Record<number, number[]> = {};
    const tagById = new Map(tags.map((tag) => [tag.id, tag]));
    const workflowStages = new Map(
      WORKFLOW_TAGS.map((tag) => [
        tag.name,
        {
          ...tag,
          exists: false,
          assignmentCount: 0,
          submissionIds: new Set<number>(),
        },
      ])
    );
    const recentWorkflowQueue: Array<{
      submissionId: number;
      tagName: string;
      tagLabel: string;
      color: string;
      assignedBy: string;
      assignedAt: string;
    }> = [];

    for (const tag of tags) {
      if (isWorkflowTagName(tag.name)) {
        workflowStages.get(tag.name)!.exists = true;
      }
    }

    for (const a of assignments) {
      tagUsage[a.tag_id] = (tagUsage[a.tag_id] || 0) + 1;
      if (!submissionTags[a.submission_id]) submissionTags[a.submission_id] = [];
      // Just initialised in the if-block above; the lookup is defined.
      submissionTags[a.submission_id]!.push(a.tag_id);

      const tagName = tagById.get(a.tag_id)?.name;
      if (tagName && isWorkflowTagName(tagName)) {
        const stage = workflowStages.get(tagName);
        if (stage) {
          stage.assignmentCount += 1;
          stage.submissionIds.add(a.submission_id);
          if (recentWorkflowQueue.length < 12) {
            recentWorkflowQueue.push({
              submissionId: a.submission_id,
              tagName: stage.name,
              tagLabel: stage.label,
              color: stage.color,
              assignedBy: a.assigned_by,
              assignedAt: a.assigned_at,
            });
          }
        }
      }
    }

    const workflowStageList = [...workflowStages.values()].map((stage) => ({
      name: stage.name,
      label: stage.label,
      color: stage.color,
      description: stage.description,
      exists: stage.exists,
      assignmentCount: stage.assignmentCount,
      submissionCount: stage.submissionIds.size,
    }));
    const workflowCoverage = new Set(
      [...workflowStages.values()].flatMap((stage) => [...stage.submissionIds])
    ).size;

    return NextResponse.json({
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        createdBy: t.created_by,
        createdAt: t.created_at,
        usageCount: tagUsage[t.id] || 0,
      })),
      assignments: assignments.map((a) => ({
        id: a.id,
        submissionId: a.submission_id,
        tagId: a.tag_id,
        assignedBy: a.assigned_by,
        assignedAt: a.assigned_at,
      })),
      submissionTags,
      totalTags: tags.length,
      totalAssignments: assignments.length,
      workflow: {
        stages: workflowStageList,
        missingStages: workflowStageList
          .filter((stage) => !stage.exists)
          .map((stage) => stage.name),
        coverage: workflowCoverage,
        recentQueue: recentWorkflowQueue,
      },
    });
  } catch (err) {
    logger.error({ err }, "Tags GET error");
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
    bucket: "admin-tags-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const action = (body as { action?: string }).action;

  if (action === "assign") {
    const parsed = assignTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    try {
      const res = await supabaseFetch("/rest/v1/submission_tag_assignment", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          submission_id: parsed.data.submissionId,
          tag_id: parsed.data.tagId,
          assigned_by: admin.email,
        }),
      });

      if (!res.ok) {
        logger.error("Tags: assignment insert failed");
        return NextResponse.json({ error: "Unable to assign tag." }, { status: 500 });
      }

      void logAdminAction({
        admin_email: admin.email,
        action: "assign_tag",
        resource_type: "submission_tag_assignment",
        resource_id: String(parsed.data.submissionId),
        metadata: { tagId: parsed.data.tagId },
        ip,
      });

      return NextResponse.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Tags assign error");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  }

  if (action === "unassign") {
    const parsed = assignTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    try {
      const res = await supabaseFetch(
        `/rest/v1/submission_tag_assignment?submission_id=eq.${parsed.data.submissionId}&tag_id=eq.${parsed.data.tagId}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } }
      );

      if (!res.ok) {
        logger.error("Tags: assignment delete failed");
        return NextResponse.json({ error: "Unable to remove tag." }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Tags unassign error");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  }

  if (action === "seed_workflow_tags") {
    try {
      const existingRes = await supabaseFetch(`/rest/v1/submission_tag?select=name`, {
        headers: { Range: "0-999" },
      });

      if (!existingRes.ok) {
        logger.error("Tags: workflow seed read failed");
        return NextResponse.json({ error: "Unable to create workflow tags." }, { status: 500 });
      }

      const existingNames = new Set(
        ((await existingRes.json()) as Array<{ name: string }>).map((row) => row.name)
      );
      const missing = WORKFLOW_TAGS.filter((tag) => !existingNames.has(tag.name));

      if (missing.length === 0) {
        return NextResponse.json({ success: true, created: [] });
      }

      const res = await supabaseFetch("/rest/v1/submission_tag", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(
          missing.map((tag) => ({
            name: tag.name,
            color: tag.color,
            created_by: admin.email,
          }))
        ),
      });

      if (!res.ok) {
        logger.error("Tags: workflow seed insert failed");
        return NextResponse.json({ error: "Unable to create workflow tags." }, { status: 500 });
      }

      await void logAdminAction({
        admin_email: admin.email,
        action: "seed_workflow_tags",
        resource_type: "submission_tag",
        metadata: { created: missing.map((tag) => tag.name) },
        ip,
      });

      return NextResponse.json({ success: true, created: missing.map((tag) => tag.name) });
    } catch (err) {
      logger.error({ err }, "Tags workflow seed error");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  }

  // Default: create a new tag
  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch("/rest/v1/submission_tag", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: parsed.data.name,
        color: parsed.data.color,
        created_by: admin.email,
      }),
    });

    if (!res.ok) {
      logger.error("Tags: tag insert failed");
      return NextResponse.json({ error: "Unable to create tag." }, { status: 500 });
    }

    const rows = (await res.json()) as Array<{ id: number }>;

    void logAdminAction({
      admin_email: admin.email,
      action: "create_tag",
      resource_type: "submission_tag",
      resource_id: String(rows[0]?.id),
      metadata: { name: parsed.data.name },
      ip,
    });

    return NextResponse.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    logger.error({ err }, "Tags create error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
