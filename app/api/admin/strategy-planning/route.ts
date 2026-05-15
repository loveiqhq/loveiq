import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import { hasRole } from "@features/admin/server/roles";
import { buildStrategyPlanningSnapshot } from "@features/admin/server/strategy-planning";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const initiativeStatusSchema = z.enum(["planned", "active", "watch", "blocked", "completed"]);
const initiativePrioritySchema = z.enum(["low", "medium", "high"]);
const betStatusSchema = z.enum(["proposed", "active", "validated", "invalidated", "parked"]);
const betConfidenceSchema = z.enum(["low", "medium", "high"]);
const competitiveMoveTypeSchema = z.enum([
  "feature",
  "pricing",
  "positioning",
  "distribution",
  "partnership",
  "brand",
  "other",
]);
const impactLevelSchema = z.enum(["low", "medium", "high", "critical"]);
const dependencyStrengthSchema = z.enum(["weak", "medium", "strong"]);
const metricKeySchema = z.string().trim().min(1).max(80);

const initiativeFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1500).optional().nullable(),
  status: initiativeStatusSchema.optional(),
  priority: initiativePrioritySchema.optional(),
  owner_email: z.string().trim().email().optional().nullable(),
  goal_id: z.number().int().positive().optional().nullable(),
  primary_metric_key: metricKeySchema.optional().nullable(),
  secondary_metric_keys: z.array(metricKeySchema).max(8).optional(),
  expected_impact: z.string().trim().max(1500).optional().nullable(),
  review_date: dateString.optional().nullable(),
  linked_href: z.string().trim().max(200).optional().nullable(),
};

const betFields = {
  title: z.string().trim().min(1).max(160),
  hypothesis: z.string().trim().min(1).max(2000),
  status: betStatusSchema.optional(),
  confidence: betConfidenceSchema.optional(),
  upside_note: z.string().trim().max(1500).optional().nullable(),
  downside_note: z.string().trim().max(1500).optional().nullable(),
  primary_metric_key: metricKeySchema.optional().nullable(),
  review_date: dateString.optional().nullable(),
  owner_email: z.string().trim().email().optional().nullable(),
  decision_note: z.string().trim().max(1500).optional().nullable(),
};

const competitiveWatchFields = {
  competitor_name: z.string().trim().min(1).max(120),
  move_type: competitiveMoveTypeSchema,
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(2000),
  impact_level: impactLevelSchema.optional(),
  primary_metric_key: metricKeySchema.optional().nullable(),
  recommended_response: z.string().trim().max(1500).optional().nullable(),
  source_href: z.string().trim().max(200).optional().nullable(),
  observed_at: dateString.optional(),
};

const dependencyFields = {
  parent_metric_key: metricKeySchema,
  child_metric_key: metricKeySchema,
  relationship_strength: dependencyStrengthSchema.optional(),
  hypothesis_note: z.string().trim().max(1500).optional().nullable(),
  evidence_note: z.string().trim().max(1500).optional().nullable(),
};

const createSchema = z.discriminatedUnion("resourceType", [
  z.object({
    action: z.literal("create"),
    resourceType: z.literal("initiative"),
    ...initiativeFields,
  }),
  z.object({ action: z.literal("create"), resourceType: z.literal("bet"), ...betFields }),
  z.object({
    action: z.literal("create"),
    resourceType: z.literal("competitive-watch"),
    ...competitiveWatchFields,
  }),
  z.object({
    action: z.literal("create"),
    resourceType: z.literal("metric-dependency"),
    ...dependencyFields,
  }),
]);

const updateSchema = z.discriminatedUnion("resourceType", [
  z
    .object({
      action: z.literal("update"),
      resourceType: z.literal("initiative"),
      id: z.number().int().positive(),
      ...initiativeFields,
    })
    .partial({
      title: true,
      description: true,
      status: true,
      priority: true,
      owner_email: true,
      goal_id: true,
      primary_metric_key: true,
      secondary_metric_keys: true,
      expected_impact: true,
      review_date: true,
      linked_href: true,
    }),
  z
    .object({
      action: z.literal("update"),
      resourceType: z.literal("bet"),
      id: z.number().int().positive(),
      ...betFields,
    })
    .partial({
      title: true,
      hypothesis: true,
      status: true,
      confidence: true,
      upside_note: true,
      downside_note: true,
      primary_metric_key: true,
      review_date: true,
      owner_email: true,
      decision_note: true,
    }),
  z
    .object({
      action: z.literal("update"),
      resourceType: z.literal("competitive-watch"),
      id: z.number().int().positive(),
      ...competitiveWatchFields,
    })
    .partial({
      competitor_name: true,
      move_type: true,
      title: true,
      detail: true,
      impact_level: true,
      primary_metric_key: true,
      recommended_response: true,
      source_href: true,
      observed_at: true,
    }),
  z
    .object({
      action: z.literal("update"),
      resourceType: z.literal("metric-dependency"),
      id: z.number().int().positive(),
      ...dependencyFields,
    })
    .partial({
      parent_metric_key: true,
      child_metric_key: true,
      relationship_strength: true,
      hypothesis_note: true,
      evidence_note: true,
    }),
]);

const postSchema = z.union([createSchema, updateSchema]);

function normalizeMetricKeys(keys: string[] | undefined, primaryMetricKey?: string | null) {
  const normalized = [...new Set((keys ?? []).map((key) => key.trim()).filter(Boolean))];
  return primaryMetricKey ? normalized.filter((key) => key !== primaryMetricKey) : normalized;
}

function strategyPlanningTable(resourceType: z.infer<typeof createSchema>["resourceType"]) {
  if (resourceType === "initiative") return "admin_strategy_initiative";
  if (resourceType === "bet") return "admin_strategy_bet";
  if (resourceType === "competitive-watch") return "admin_competitive_watch";
  return "admin_metric_dependency";
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
    bucket: "admin-strategy-planning",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    return NextResponse.json(await buildStrategyPlanningSnapshot());
  } catch (err) {
    logger.error({ err }, "Strategy planning GET error");
    return NextResponse.json({ error: "Unable to load strategy planning." }, { status: 500 });
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
    bucket: "admin-strategy-planning-write",
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
      let payload: Record<string, unknown>;
      let path: string;

      if (parsed.data.resourceType === "initiative") {
        payload = {
          admin_email: admin.email,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          status: parsed.data.status ?? "planned",
          priority: parsed.data.priority ?? "medium",
          owner_email: parsed.data.owner_email ?? null,
          goal_id: parsed.data.goal_id ?? null,
          primary_metric_key: parsed.data.primary_metric_key ?? null,
          secondary_metric_keys: normalizeMetricKeys(
            parsed.data.secondary_metric_keys,
            parsed.data.primary_metric_key ?? null
          ),
          expected_impact: parsed.data.expected_impact ?? null,
          review_date: parsed.data.review_date ?? null,
          linked_href: parsed.data.linked_href ?? null,
        };
        path = "/rest/v1/admin_strategy_initiative";
      } else if (parsed.data.resourceType === "bet") {
        payload = {
          admin_email: admin.email,
          title: parsed.data.title,
          hypothesis: parsed.data.hypothesis,
          status: parsed.data.status ?? "proposed",
          confidence: parsed.data.confidence ?? "medium",
          upside_note: parsed.data.upside_note ?? null,
          downside_note: parsed.data.downside_note ?? null,
          primary_metric_key: parsed.data.primary_metric_key ?? null,
          review_date: parsed.data.review_date ?? null,
          owner_email: parsed.data.owner_email ?? null,
          decision_note: parsed.data.decision_note ?? null,
        };
        path = "/rest/v1/admin_strategy_bet";
      } else if (parsed.data.resourceType === "competitive-watch") {
        payload = {
          admin_email: admin.email,
          competitor_name: parsed.data.competitor_name,
          move_type: parsed.data.move_type,
          title: parsed.data.title,
          detail: parsed.data.detail,
          impact_level: parsed.data.impact_level ?? "medium",
          primary_metric_key: parsed.data.primary_metric_key ?? null,
          recommended_response: parsed.data.recommended_response ?? null,
          source_href: parsed.data.source_href ?? null,
          observed_at: parsed.data.observed_at ?? new Date().toISOString().slice(0, 10),
        };
        path = "/rest/v1/admin_competitive_watch";
      } else {
        payload = {
          admin_email: admin.email,
          parent_metric_key: parsed.data.parent_metric_key,
          child_metric_key: parsed.data.child_metric_key,
          relationship_strength: parsed.data.relationship_strength ?? "medium",
          hypothesis_note: parsed.data.hypothesis_note ?? null,
          evidence_note: parsed.data.evidence_note ?? null,
        };
        path = "/rest/v1/admin_metric_dependency";
      }

      const response = await supabaseFetch(path, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        logger.error(
          { status: response.status, resourceType: parsed.data.resourceType },
          "Strategy planning creation failed"
        );
        return NextResponse.json(
          { error: "Unable to save strategy planning record." },
          { status: 500 }
        );
      }

      const rows = (await response.json()) as Array<{ id: number }>;
      await logAdminAction({
        admin_email: admin.email,
        action: `create_${strategyPlanningTable(parsed.data.resourceType)}`,
        resource_type: strategyPlanningTable(parsed.data.resourceType),
        resource_id: String(rows[0]?.id ?? ""),
        metadata: { resourceType: parsed.data.resourceType },
        ip,
      });

      return NextResponse.json({ success: true, id: rows[0]?.id ?? null });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let path = "";
    let resourceTable = "";

    if (parsed.data.resourceType === "initiative") {
      resourceTable = "admin_strategy_initiative";
      path = `/rest/v1/admin_strategy_initiative?id=eq.${parsed.data.id}`;
      if (parsed.data.title !== undefined) updates.title = parsed.data.title;
      if (parsed.data.description !== undefined)
        updates.description = parsed.data.description ?? null;
      if (parsed.data.status !== undefined) updates.status = parsed.data.status;
      if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
      if (parsed.data.owner_email !== undefined)
        updates.owner_email = parsed.data.owner_email ?? null;
      if (parsed.data.goal_id !== undefined) updates.goal_id = parsed.data.goal_id ?? null;
      if (parsed.data.primary_metric_key !== undefined) {
        updates.primary_metric_key = parsed.data.primary_metric_key ?? null;
      }
      if (parsed.data.secondary_metric_keys !== undefined) {
        updates.secondary_metric_keys = normalizeMetricKeys(
          parsed.data.secondary_metric_keys,
          parsed.data.primary_metric_key
        );
      }
      if (parsed.data.expected_impact !== undefined) {
        updates.expected_impact = parsed.data.expected_impact ?? null;
      }
      if (parsed.data.review_date !== undefined)
        updates.review_date = parsed.data.review_date ?? null;
      if (parsed.data.linked_href !== undefined)
        updates.linked_href = parsed.data.linked_href ?? null;
    } else if (parsed.data.resourceType === "bet") {
      resourceTable = "admin_strategy_bet";
      path = `/rest/v1/admin_strategy_bet?id=eq.${parsed.data.id}`;
      if (parsed.data.title !== undefined) updates.title = parsed.data.title;
      if (parsed.data.hypothesis !== undefined) updates.hypothesis = parsed.data.hypothesis;
      if (parsed.data.status !== undefined) updates.status = parsed.data.status;
      if (parsed.data.confidence !== undefined) updates.confidence = parsed.data.confidence;
      if (parsed.data.upside_note !== undefined)
        updates.upside_note = parsed.data.upside_note ?? null;
      if (parsed.data.downside_note !== undefined)
        updates.downside_note = parsed.data.downside_note ?? null;
      if (parsed.data.primary_metric_key !== undefined) {
        updates.primary_metric_key = parsed.data.primary_metric_key ?? null;
      }
      if (parsed.data.review_date !== undefined)
        updates.review_date = parsed.data.review_date ?? null;
      if (parsed.data.owner_email !== undefined)
        updates.owner_email = parsed.data.owner_email ?? null;
      if (parsed.data.decision_note !== undefined)
        updates.decision_note = parsed.data.decision_note ?? null;
    } else if (parsed.data.resourceType === "competitive-watch") {
      resourceTable = "admin_competitive_watch";
      path = `/rest/v1/admin_competitive_watch?id=eq.${parsed.data.id}`;
      if (parsed.data.competitor_name !== undefined)
        updates.competitor_name = parsed.data.competitor_name;
      if (parsed.data.move_type !== undefined) updates.move_type = parsed.data.move_type;
      if (parsed.data.title !== undefined) updates.title = parsed.data.title;
      if (parsed.data.detail !== undefined) updates.detail = parsed.data.detail;
      if (parsed.data.impact_level !== undefined) updates.impact_level = parsed.data.impact_level;
      if (parsed.data.primary_metric_key !== undefined) {
        updates.primary_metric_key = parsed.data.primary_metric_key ?? null;
      }
      if (parsed.data.recommended_response !== undefined) {
        updates.recommended_response = parsed.data.recommended_response ?? null;
      }
      if (parsed.data.source_href !== undefined)
        updates.source_href = parsed.data.source_href ?? null;
      if (parsed.data.observed_at !== undefined) updates.observed_at = parsed.data.observed_at;
    } else {
      resourceTable = "admin_metric_dependency";
      path = `/rest/v1/admin_metric_dependency?id=eq.${parsed.data.id}`;
      if (parsed.data.parent_metric_key !== undefined) {
        updates.parent_metric_key = parsed.data.parent_metric_key;
      }
      if (parsed.data.child_metric_key !== undefined)
        updates.child_metric_key = parsed.data.child_metric_key;
      if (parsed.data.relationship_strength !== undefined) {
        updates.relationship_strength = parsed.data.relationship_strength;
      }
      if (parsed.data.hypothesis_note !== undefined) {
        updates.hypothesis_note = parsed.data.hypothesis_note ?? null;
      }
      if (parsed.data.evidence_note !== undefined)
        updates.evidence_note = parsed.data.evidence_note ?? null;
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    const response = await supabaseFetch(path, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      logger.error(
        { status: response.status, resourceType: parsed.data.resourceType, id: parsed.data.id },
        "Strategy planning update failed"
      );
      return NextResponse.json(
        { error: "Unable to update strategy planning record." },
        { status: 500 }
      );
    }

    await logAdminAction({
      admin_email: admin.email,
      action: `update_${resourceTable}`,
      resource_type: resourceTable,
      resource_id: String(parsed.data.id),
      metadata: { fields: Object.keys(updates).filter((key) => key !== "updated_at") },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Strategy planning POST error");
    return NextResponse.json(
      { error: "Unable to process strategy planning request." },
      { status: 500 }
    );
  }
}
