import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { logAdminAction } from "@/lib/admin/audit";
import { WORKFLOW_TAGS } from "@/lib/admin/workflow-tags";
import logger from "@/lib/logger";
import { z } from "zod";

const WORKFLOW_QUESTION_CHANGE_CANDIDATE_KEY = ["workflow", "question", "change", "candidate"].join(
  "_"
);

const WORKFLOW_METRIC_TO_TAG_NAME = {
  workflow_needs_review: WORKFLOW_TAGS[0].name,
  workflow_root_cause_found: WORKFLOW_TAGS[1].name,
  [WORKFLOW_QUESTION_CHANGE_CANDIDATE_KEY]: WORKFLOW_TAGS[2].name,
  workflow_monitoring: WORKFLOW_TAGS[3].name,
} as const;

const createGoalSchema = z.object({
  label: z.string().min(1).max(100),
  metric_key: z.string().min(1),
  target_value: z.number().positive(),
  deadline: z.string().optional(),
});

const updateStatusSchema = z.object({
  action: z.literal("update_status"),
  goalId: z.number().int().positive(),
  status: z.enum(["active", "achieved", "cancelled"]),
});

const deleteGoalSchema = z.object({
  action: z.literal("delete"),
  goalId: z.number().int().positive(),
});

async function fetchMetricValue(metricKey: string): Promise<number | null> {
  try {
    switch (metricKey) {
      case "total_submissions": {
        const res = await supabaseFetch(`/rest/v1/survey_submission?select=id&limit=1`, {
          method: "HEAD",
          headers: { Prefer: "count=exact" },
        });
        const range = res.headers.get("content-range");
        if (range) {
          const total = range.split("/")[1];
          return total && total !== "*" ? parseInt(total, 10) : 0;
        }
        return 0;
      }
      case "completion_rate": {
        const [totalRes, completedRes] = await Promise.all([
          supabaseFetch(`/rest/v1/survey_submission?select=id&limit=1`, {
            method: "HEAD",
            headers: { Prefer: "count=exact" },
          }),
          supabaseFetch(`/rest/v1/survey_submission?select=id&status=eq.completed&limit=1`, {
            method: "HEAD",
            headers: { Prefer: "count=exact" },
          }),
        ]);
        const totalRange = totalRes.headers.get("content-range");
        const completedRange = completedRes.headers.get("content-range");
        const total =
          totalRange && totalRange.split("/")[1] !== "*"
            ? parseInt(totalRange.split("/")[1], 10)
            : 0;
        const completed =
          completedRange && completedRange.split("/")[1] !== "*"
            ? parseInt(completedRange.split("/")[1], 10)
            : 0;
        if (total === 0) return 0;
        return Math.round((completed / total) * 100);
      }
      case "waitlist_signups": {
        const res = await supabaseFetch(`/rest/v1/waitlist_user?select=id&limit=1`, {
          method: "HEAD",
          headers: { Prefer: "count=exact" },
        });
        const range = res.headers.get("content-range");
        if (range) {
          const total = range.split("/")[1];
          return total && total !== "*" ? parseInt(total, 10) : 0;
        }
        return 0;
      }
      case "scored_count": {
        const res = await supabaseFetch(`/rest/v1/scoring_result?select=id&limit=1`, {
          method: "HEAD",
          headers: { Prefer: "count=exact" },
        });
        const range = res.headers.get("content-range");
        if (range) {
          const total = range.split("/")[1];
          return total && total !== "*" ? parseInt(total, 10) : 0;
        }
        return 0;
      }
      case "workflow_needs_review":
      case "workflow_root_cause_found":
      case WORKFLOW_QUESTION_CHANGE_CANDIDATE_KEY:
      case "workflow_monitoring": {
        const workflowName =
          WORKFLOW_METRIC_TO_TAG_NAME[metricKey as keyof typeof WORKFLOW_METRIC_TO_TAG_NAME];

        const tagRes = await supabaseFetch(
          `/rest/v1/submission_tag?select=id&name=eq.${encodeURIComponent(workflowName)}`,
          { headers: { Range: "0-1" } }
        );
        if (!tagRes.ok) return null;

        const tags = (await tagRes.json()) as Array<{ id: number }>;
        if (tags.length === 0) return 0;

        const assignmentRes = await supabaseFetch(
          `/rest/v1/submission_tag_assignment?select=submission_id&tag_id=eq.${tags[0].id}`,
          { headers: { Range: "0-9999" } }
        );
        if (!assignmentRes.ok) return null;

        const assignments = (await assignmentRes.json()) as Array<{ submission_id: number }>;
        return new Set(assignments.map((row) => row.submission_id)).size;
      }
      default:
        return null;
    }
  } catch (err) {
    logger.warn({ err, metricKey }, "Failed to fetch metric value");
    return null;
  }
}

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
    bucket: "admin-goals",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const goalsRes = await supabaseFetch(`/rest/v1/admin_goals?select=*&order=created_at.desc`, {
      headers: { Range: "0-999" },
    });

    if (!goalsRes.ok) {
      logger.error("Goals: Supabase query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const goals = (await goalsRes.json()) as Array<{
      id: number;
      label: string;
      metric_key: string;
      target_value: number;
      status: string;
      deadline: string | null;
      admin_email: string;
      created_at: string;
    }>;

    const metricKeys = [...new Set(goals.map((g) => g.metric_key))];
    const metricValues: Record<string, number | null> = {};
    await Promise.all(
      metricKeys.map(async (key) => {
        metricValues[key] = await fetchMetricValue(key);
      })
    );

    return NextResponse.json({
      goals: goals.map((g) => ({
        id: g.id,
        label: g.label,
        metricKey: g.metric_key,
        targetValue: g.target_value,
        currentValue: metricValues[g.metric_key] ?? null,
        status: g.status,
        deadline: g.deadline,
        createdBy: g.admin_email,
        createdAt: g.created_at,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Goals GET error");
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
    bucket: "admin-goals-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const action = (body as { action?: string }).action;

  if (action === "update_status") {
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    try {
      const res = await supabaseFetch(`/rest/v1/admin_goals?id=eq.${parsed.data.goalId}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: parsed.data.status }),
      });

      if (!res.ok) {
        logger.error("Goals: status update failed");
        return NextResponse.json({ error: "Unable to update goal." }, { status: 500 });
      }

      logAdminAction({
        admin_email: admin.email,
        action: "update_goal_status",
        resource_type: "admin_goals",
        resource_id: String(parsed.data.goalId),
        metadata: { status: parsed.data.status },
        ip,
      });

      return NextResponse.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Goals update_status error");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  }

  if (action === "delete") {
    const parsed = deleteGoalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }
    if (!hasRole(admin.role, "admin")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    try {
      const res = await supabaseFetch(`/rest/v1/admin_goals?id=eq.${parsed.data.goalId}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });

      if (!res.ok) {
        logger.error("Goals: delete failed");
        return NextResponse.json({ error: "Unable to delete goal." }, { status: 500 });
      }

      logAdminAction({
        admin_email: admin.email,
        action: "delete_goal",
        resource_type: "admin_goals",
        resource_id: String(parsed.data.goalId),
        metadata: {},
        ip,
      });

      return NextResponse.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Goals delete error");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  }

  // Default: create a new goal
  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch("/rest/v1/admin_goals", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        label: parsed.data.label,
        metric_key: parsed.data.metric_key,
        target_value: parsed.data.target_value,
        deadline: parsed.data.deadline || null,
        status: "active",
        admin_email: admin.email,
      }),
    });

    if (!res.ok) {
      logger.error("Goals: goal insert failed");
      return NextResponse.json({ error: "Unable to create goal." }, { status: 500 });
    }

    const rows = (await res.json()) as Array<{ id: number }>;

    logAdminAction({
      admin_email: admin.email,
      action: "create_goal",
      resource_type: "admin_goals",
      resource_id: String(rows[0]?.id),
      metadata: { label: parsed.data.label, metric_key: parsed.data.metric_key },
      ip,
    });

    return NextResponse.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    logger.error({ err }, "Goals create error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
