import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import { logAdminAction } from "@features/admin/server/audit";
import logger from "@shared/observability/logger";
import { z } from "zod";

const createRuleSchema = z.object({
  tag_id: z.number().int().positive(),
  field: z.enum(["duration_ms", "backtrack_count", "revision_count", "status"]),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq", "contains"]),
  value: z.string().min(1),
});

const ruleIdSchema = z.object({
  ruleId: z.number().int().positive(),
});

const OPERATOR_MAP: Record<string, string> = {
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  eq: "eq",
  contains: "like",
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
    bucket: "admin-tag-rules",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/admin_tag_rules?select=*&order=created_at.desc`, {
      headers: { Range: "0-999" },
    });

    if (!res.ok) {
      logger.error("Tag rules: Supabase query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const rules = (await res.json()) as Array<{
      id: number;
      tag_id: number;
      field: string;
      operator: string;
      value: string;
      is_active: boolean;
      created_by: string;
      created_at: string;
    }>;

    return NextResponse.json({ rules });
  } catch (err) {
    logger.error({ err }, "Tag rules GET error");
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
    bucket: "admin-tag-rules-write",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const action = (body as { action?: string }).action;

  if (action === "toggle") {
    const parsed = ruleIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    try {
      const getRes = await supabaseFetch(
        `/rest/v1/admin_tag_rules?id=eq.${parsed.data.ruleId}&select=is_active`
      );
      if (!getRes.ok) {
        return NextResponse.json({ error: "Rule not found." }, { status: 404 });
      }
      const rows = (await getRes.json()) as Array<{ is_active: boolean }>;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Rule not found." }, { status: 404 });
      }

      const res = await supabaseFetch(`/rest/v1/admin_tag_rules?id=eq.${parsed.data.ruleId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ is_active: !rows[0]!.is_active }),
      });

      if (!res.ok) {
        logger.error("Tag rules: toggle failed");
        return NextResponse.json({ error: "Unable to toggle rule." }, { status: 500 });
      }

      void logAdminAction({
        admin_email: admin.email,
        action: "toggle_tag_rule",
        resource_type: "admin_tag_rules",
        resource_id: String(parsed.data.ruleId),
        metadata: { newState: !rows[0]!.is_active },
        ip,
      });

      return NextResponse.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Tag rules toggle error");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  }

  if (action === "delete") {
    if (!hasRole(admin.role, "admin")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const parsed = ruleIdSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    try {
      const res = await supabaseFetch(`/rest/v1/admin_tag_rules?id=eq.${parsed.data.ruleId}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });

      if (!res.ok) {
        logger.error("Tag rules: delete failed");
        return NextResponse.json({ error: "Unable to delete rule." }, { status: 500 });
      }

      void logAdminAction({
        admin_email: admin.email,
        action: "delete_tag_rule",
        resource_type: "admin_tag_rules",
        resource_id: String(parsed.data.ruleId),
        metadata: {},
        ip,
      });

      return NextResponse.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Tag rules delete error");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  }

  if (action === "run") {
    try {
      const rulesRes = await supabaseFetch(`/rest/v1/admin_tag_rules?is_active=eq.true&select=*`);
      if (!rulesRes.ok) {
        return NextResponse.json({ error: "Unable to load rules." }, { status: 500 });
      }

      const activeRules = (await rulesRes.json()) as Array<{
        id: number;
        tag_id: number;
        field: string;
        operator: string;
        value: string;
      }>;

      if (activeRules.length === 0) {
        return NextResponse.json({ success: true, newAssignments: 0 });
      }

      let totalNewAssignments = 0;

      for (const rule of activeRules) {
        const supaOp = OPERATOR_MAP[rule.operator] || "eq";
        const filterValue = rule.operator === "contains" ? `*${rule.value}*` : rule.value;
        const filter = `${rule.field}=${supaOp}.${filterValue}`;

        const subRes = await supabaseFetch(`/rest/v1/survey_submission?${filter}&select=id`, {
          headers: { Range: "0-9999" },
        });

        if (!subRes.ok) continue;

        const submissions = (await subRes.json()) as Array<{ id: number }>;
        if (submissions.length === 0) continue;

        const existingRes = await supabaseFetch(
          `/rest/v1/submission_tag_assignment?tag_id=eq.${rule.tag_id}&select=submission_id`,
          { headers: { Range: "0-99999" } }
        );

        const existingIds = new Set<number>();
        if (existingRes.ok) {
          const existing = (await existingRes.json()) as Array<{ submission_id: number }>;
          for (const e of existing) existingIds.add(e.submission_id);
        }

        const newSubmissions = submissions.filter((s) => !existingIds.has(s.id));
        if (newSubmissions.length === 0) continue;

        const insertBody = newSubmissions.map((s) => ({
          submission_id: s.id,
          tag_id: rule.tag_id,
          assigned_by: `auto-rule:${rule.id}`,
        }));

        const insertRes = await supabaseFetch(`/rest/v1/submission_tag_assignment`, {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(insertBody),
        });

        if (insertRes.ok) {
          totalNewAssignments += newSubmissions.length;
        }
      }

      void logAdminAction({
        admin_email: admin.email,
        action: "run_tag_rules",
        resource_type: "admin_tag_rules",
        resource_id: "all",
        metadata: { newAssignments: totalNewAssignments, rulesRun: activeRules.length },
        ip,
      });

      return NextResponse.json({ success: true, newAssignments: totalNewAssignments });
    } catch (err) {
      logger.error({ err }, "Tag rules run error");
      return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
    }
  }

  // Default: create a new rule
  const parsed = createRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch("/rest/v1/admin_tag_rules", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        tag_id: parsed.data.tag_id,
        field: parsed.data.field,
        operator: parsed.data.operator,
        value: parsed.data.value,
        is_active: true,
        created_by: admin.email,
      }),
    });

    if (!res.ok) {
      logger.error("Tag rules: insert failed");
      return NextResponse.json({ error: "Unable to create rule." }, { status: 500 });
    }

    const rows = (await res.json()) as Array<{ id: number }>;

    void logAdminAction({
      admin_email: admin.email,
      action: "create_tag_rule",
      resource_type: "admin_tag_rules",
      resource_id: String(rows[0]?.id),
      metadata: {
        tag_id: parsed.data.tag_id,
        field: parsed.data.field,
        operator: parsed.data.operator,
        value: parsed.data.value,
      },
      ip,
    });

    return NextResponse.json({ success: true, id: rows[0]?.id });
  } catch (err) {
    logger.error({ err }, "Tag rules create error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
