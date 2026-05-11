import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { logAdminAction } from "@/lib/admin/audit";
import { fetchMetricValue } from "@/lib/admin/metric-library";
import logger from "@/lib/logger";
import { z } from "zod";

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

function createMetricValues(keys: string[]) {
  return new Map<string, number | null>(keys.map((key) => [key, null]));
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
    const metricValues = createMetricValues(metricKeys);
    await Promise.all(
      metricKeys.map(async (key) => {
        metricValues.set(key, await fetchMetricValue(key));
      })
    );

    return NextResponse.json({
      goals: goals.map((g) => ({
        id: g.id,
        label: g.label,
        metricKey: g.metric_key,
        targetValue: g.target_value,
        currentValue: metricValues.get(g.metric_key) ?? null,
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

      void logAdminAction({
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

      void logAdminAction({
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

    void logAdminAction({
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
