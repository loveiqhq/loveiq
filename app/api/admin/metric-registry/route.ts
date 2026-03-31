import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { buildMetricRegistrySnapshot } from "@/lib/admin/metric-registry";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const baseFields = {
  metric_key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  owner_email: z.string().trim().email().optional().nullable(),
  stewardship_role: z.enum(["strategy", "product", "growth", "tech", "ops"]).optional().nullable(),
  formula: z.string().trim().max(500).optional().nullable(),
  source_of_truth: z.string().trim().max(240).optional().nullable(),
  review_cadence_days: z.number().int().min(7).max(365).optional(),
  unit: z.enum(["percent", "minutes", "count", "currency", "score"]).optional(),
  linked_href: z.string().trim().max(200).optional().nullable(),
  trust_mode: z.enum(["live", "derived", "sampled", "materialized"]).optional(),
  trust_note: z.string().trim().max(500).optional().nullable(),
  caveats: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(["draft", "active", "watch", "deprecated"]).optional(),
};

const createSchema = z.object({
  action: z.literal("create"),
  ...baseFields,
});

const updateSchema = z
  .object({
    action: z.literal("update"),
    registryId: z.number().int().positive(),
    ...baseFields,
  })
  .partial({
    metric_key: true,
    label: true,
    description: true,
    owner_email: true,
    stewardship_role: true,
    formula: true,
    source_of_truth: true,
    review_cadence_days: true,
    unit: true,
    linked_href: true,
    trust_mode: true,
    trust_note: true,
    caveats: true,
    status: true,
  });

const reviewSchema = z.object({
  action: z.literal("review"),
  registryId: z.number().int().positive(),
});

const postSchema = z.discriminatedUnion("action", [createSchema, updateSchema, reviewSchema]);

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
    bucket: "admin-metric-registry",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    return NextResponse.json(await buildMetricRegistrySnapshot());
  } catch (err) {
    logger.error({ err }, "Metric registry GET error");
    return NextResponse.json({ error: "Unable to load metric registry." }, { status: 500 });
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
    bucket: "admin-metric-registry-write",
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
      const res = await supabaseFetch("/rest/v1/admin_metric_registry", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...parsed.data,
          admin_email: admin.email,
          description: parsed.data.description ?? null,
          owner_email: parsed.data.owner_email ?? null,
          stewardship_role: parsed.data.stewardship_role ?? null,
          formula: parsed.data.formula ?? null,
          source_of_truth: parsed.data.source_of_truth ?? null,
          review_cadence_days: parsed.data.review_cadence_days ?? 30,
          unit: parsed.data.unit ?? "count",
          linked_href: parsed.data.linked_href ?? null,
          trust_mode: parsed.data.trust_mode ?? "derived",
          trust_note: parsed.data.trust_note ?? null,
          caveats: parsed.data.caveats ?? null,
          status: parsed.data.status ?? "active",
        }),
      });

      if (!res.ok) {
        logger.error({ status: res.status }, "Metric registry creation failed");
        return NextResponse.json({ error: "Unable to create metric definition." }, { status: 500 });
      }

      const created = (await res.json()) as Array<{ id: number }>;
      await logAdminAction({
        admin_email: admin.email,
        action: "create_metric_registry_entry",
        resource_type: "admin_metric_registry",
        resource_id: String(created[0]?.id ?? ""),
        metadata: { metric_key: parsed.data.metric_key },
        ip,
      });

      return NextResponse.json({ success: true, id: created[0]?.id ?? null });
    }

    if (parsed.data.action === "review") {
      const res = await supabaseFetch(
        `/rest/v1/admin_metric_registry?id=eq.${parsed.data.registryId}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            last_reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        }
      );
      if (!res.ok) {
        logger.error({ status: res.status }, "Metric registry review failed");
        return NextResponse.json({ error: "Unable to mark metric as reviewed." }, { status: 500 });
      }

      await logAdminAction({
        admin_email: admin.email,
        action: "review_metric_registry_entry",
        resource_type: "admin_metric_registry",
        resource_id: String(parsed.data.registryId),
        metadata: {},
        ip,
      });

      return NextResponse.json({ success: true });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.metric_key !== undefined) patch.metric_key = parsed.data.metric_key;
    if (parsed.data.label !== undefined) patch.label = parsed.data.label;
    if (parsed.data.description !== undefined) patch.description = parsed.data.description ?? null;
    if (parsed.data.owner_email !== undefined) patch.owner_email = parsed.data.owner_email ?? null;
    if (parsed.data.stewardship_role !== undefined) {
      patch.stewardship_role = parsed.data.stewardship_role ?? null;
    }
    if (parsed.data.formula !== undefined) patch.formula = parsed.data.formula ?? null;
    if (parsed.data.source_of_truth !== undefined) {
      patch.source_of_truth = parsed.data.source_of_truth ?? null;
    }
    if (parsed.data.review_cadence_days !== undefined) {
      patch.review_cadence_days = parsed.data.review_cadence_days;
    }
    if (parsed.data.unit !== undefined) patch.unit = parsed.data.unit;
    if (parsed.data.linked_href !== undefined) patch.linked_href = parsed.data.linked_href ?? null;
    if (parsed.data.trust_mode !== undefined) patch.trust_mode = parsed.data.trust_mode;
    if (parsed.data.trust_note !== undefined) patch.trust_note = parsed.data.trust_note ?? null;
    if (parsed.data.caveats !== undefined) patch.caveats = parsed.data.caveats ?? null;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;

    const res = await supabaseFetch(
      `/rest/v1/admin_metric_registry?id=eq.${parsed.data.registryId}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch),
      }
    );
    if (!res.ok) {
      logger.error({ status: res.status }, "Metric registry update failed");
      return NextResponse.json({ error: "Unable to update metric definition." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "update_metric_registry_entry",
      resource_type: "admin_metric_registry",
      resource_id: String(parsed.data.registryId),
      metadata: { fields: Object.keys(patch) },
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Metric registry POST error");
    return NextResponse.json(
      { error: "Unable to process metric registry request." },
      { status: 500 }
    );
  }
}
