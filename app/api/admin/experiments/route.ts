import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { logAdminAction } from "@features/admin/server/audit";
import {
  buildExperimentRegistrySnapshot,
  EXPERIMENT_SELECT,
  normalizeExperimentMetrics,
  normalizeGuardrails,
  type ExperimentRow,
} from "@features/admin/server/experiment-registry";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

const experimentStatusSchema = z.enum(["draft", "active", "paused", "completed", "archived"]);
const experimentReadoutMethodSchema = z.enum(["conversion-rate", "count-delta", "average-value"]);
const nonNegativeInt = z.number().int().min(0);
const nonNegativeNumber = z.number().min(0);

const createSchema = z.object({
  action: z.literal("create"),
  name: z.string().trim().min(1).max(120),
  hypothesis: z.string().trim().min(1).max(1000),
  owner_email: z.string().trim().email().optional().nullable(),
  segment_id: z.number().int().positive().optional().nullable(),
  primary_metric_key: z.string().trim().min(1).max(80),
  guardrail_metric_keys: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  status: experimentStatusSchema.optional(),
  start_date: z.string().optional().nullable(),
  decision_date: z.string().optional().nullable(),
  expected_impact: z.string().trim().max(500).optional().nullable(),
  result_summary: z.string().trim().max(1000).optional().nullable(),
  outcome: z.string().trim().max(1000).optional().nullable(),
  readout_method: experimentReadoutMethodSchema.optional().nullable(),
  control_sample_size: nonNegativeInt.optional().nullable(),
  control_success_count: nonNegativeInt.optional().nullable(),
  variant_sample_size: nonNegativeInt.optional().nullable(),
  variant_success_count: nonNegativeInt.optional().nullable(),
  control_metric_value: nonNegativeNumber.optional().nullable(),
  variant_metric_value: nonNegativeNumber.optional().nullable(),
  control_stddev_value: nonNegativeNumber.optional().nullable(),
  variant_stddev_value: nonNegativeNumber.optional().nullable(),
  readout_notes: z.string().trim().max(1000).optional().nullable(),
});

const updateSchema = createSchema
  .extend({
    action: z.literal("update"),
    experimentId: z.number().int().positive(),
    name: z.string().trim().min(1).max(120).optional(),
    hypothesis: z.string().trim().min(1).max(1000).optional(),
    primary_metric_key: z.string().trim().min(1).max(80).optional(),
  })
  .partial({
    owner_email: true,
    segment_id: true,
    guardrail_metric_keys: true,
    status: true,
    start_date: true,
    decision_date: true,
    expected_impact: true,
    result_summary: true,
    outcome: true,
    readout_method: true,
    control_sample_size: true,
    control_success_count: true,
    variant_sample_size: true,
    variant_success_count: true,
    control_metric_value: true,
    variant_metric_value: true,
    control_stddev_value: true,
    variant_stddev_value: true,
    readout_notes: true,
  });

const deleteSchema = z.object({
  action: z.literal("delete"),
  experimentId: z.number().int().positive(),
});

const postSchema = z.discriminatedUnion("action", [createSchema, updateSchema, deleteSchema]);

async function loadExperiment(experimentId: number) {
  const response = await supabaseFetch(
    `/rest/v1/admin_experiment?id=eq.${experimentId}&select=${EXPERIMENT_SELECT}`,
    { headers: { Range: "0-0" } }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as ExperimentRow[];
  return rows[0] ?? null;
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
    bucket: "admin-experiments",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    return NextResponse.json(await buildExperimentRegistrySnapshot(admin.email));
  } catch (err) {
    logger.error({ err }, "Experiments GET error");
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
    bucket: "admin-experiments-write",
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
      const primaryMetricKey = parsed.data.primary_metric_key;
      const guardrailMetricKeys = normalizeGuardrails(
        primaryMetricKey,
        parsed.data.guardrail_metric_keys
      );
      const createRes = await supabaseFetch("/rest/v1/rpc/admin_upsert_experiment", {
        method: "POST",
        body: JSON.stringify({
          p_admin_email: admin.email,
          p_owner_email: parsed.data.owner_email ?? null,
          p_name: parsed.data.name,
          p_hypothesis: parsed.data.hypothesis,
          p_segment_id: parsed.data.segment_id ?? null,
          p_primary_metric_key: primaryMetricKey,
          p_guardrail_metric_keys: guardrailMetricKeys,
          p_status: parsed.data.status ?? "draft",
          p_start_date: parsed.data.start_date ?? null,
          p_decision_date: parsed.data.decision_date ?? null,
          p_expected_impact: parsed.data.expected_impact ?? null,
          p_result_summary: parsed.data.result_summary ?? null,
          p_outcome: parsed.data.outcome ?? null,
          p_readout_method: parsed.data.readout_method ?? "conversion-rate",
          p_control_sample_size: parsed.data.control_sample_size ?? null,
          p_control_success_count: parsed.data.control_success_count ?? null,
          p_variant_sample_size: parsed.data.variant_sample_size ?? null,
          p_variant_success_count: parsed.data.variant_success_count ?? null,
          p_control_metric_value: parsed.data.control_metric_value ?? null,
          p_variant_metric_value: parsed.data.variant_metric_value ?? null,
          p_control_stddev_value: parsed.data.control_stddev_value ?? null,
          p_variant_stddev_value: parsed.data.variant_stddev_value ?? null,
          p_readout_notes: parsed.data.readout_notes ?? null,
        }),
      });

      if (!createRes.ok) {
        logger.error({ status: createRes.status }, "Experiment creation failed");
        return NextResponse.json({ error: "Unable to create experiment." }, { status: 500 });
      }

      const createdId = (await createRes.json()) as number | null;
      await logAdminAction({
        admin_email: admin.email,
        action: "create_experiment",
        resource_type: "admin_experiment",
        resource_id: String(createdId ?? ""),
        metadata: { name: parsed.data.name, metric: primaryMetricKey },
        ip,
      });

      return NextResponse.json({ success: true, id: createdId });
    }

    if (parsed.data.action === "update") {
      const existing = await loadExperiment(parsed.data.experimentId);
      if (!existing) {
        return NextResponse.json({ error: "Experiment not found." }, { status: 404 });
      }

      const existingMetrics = normalizeExperimentMetrics(existing);
      const primaryMetricKey = parsed.data.primary_metric_key ?? existingMetrics.primaryMetricKey;
      const guardrailMetricKeys = normalizeGuardrails(
        primaryMetricKey,
        parsed.data.guardrail_metric_keys ?? existingMetrics.guardrailMetricKeys
      );

      const updateRes = await supabaseFetch("/rest/v1/rpc/admin_upsert_experiment", {
        method: "POST",
        body: JSON.stringify({
          p_admin_email: existing.admin_email ?? admin.email,
          p_experiment_id: parsed.data.experimentId,
          p_owner_email:
            parsed.data.owner_email !== undefined
              ? (parsed.data.owner_email ?? null)
              : existing.owner_email,
          p_name: parsed.data.name ?? existing.name,
          p_hypothesis: parsed.data.hypothesis ?? existing.hypothesis,
          p_segment_id:
            parsed.data.segment_id !== undefined
              ? (parsed.data.segment_id ?? null)
              : existing.segment_id,
          p_primary_metric_key: primaryMetricKey,
          p_guardrail_metric_keys: guardrailMetricKeys,
          p_status: parsed.data.status ?? existing.status,
          p_start_date:
            parsed.data.start_date !== undefined
              ? (parsed.data.start_date ?? null)
              : existing.start_date,
          p_decision_date:
            parsed.data.decision_date !== undefined
              ? (parsed.data.decision_date ?? null)
              : existing.decision_date,
          p_expected_impact:
            parsed.data.expected_impact !== undefined
              ? (parsed.data.expected_impact ?? null)
              : existing.expected_impact,
          p_result_summary:
            parsed.data.result_summary !== undefined
              ? (parsed.data.result_summary ?? null)
              : existing.result_summary,
          p_outcome:
            parsed.data.outcome !== undefined ? (parsed.data.outcome ?? null) : existing.outcome,
          p_readout_method:
            parsed.data.readout_method !== undefined
              ? (parsed.data.readout_method ?? "conversion-rate")
              : existing.readout_method,
          p_control_sample_size:
            parsed.data.control_sample_size !== undefined
              ? (parsed.data.control_sample_size ?? null)
              : existing.control_sample_size,
          p_control_success_count:
            parsed.data.control_success_count !== undefined
              ? (parsed.data.control_success_count ?? null)
              : existing.control_success_count,
          p_control_metric_value:
            parsed.data.control_metric_value !== undefined
              ? (parsed.data.control_metric_value ?? null)
              : existing.control_metric_value,
          p_control_stddev_value:
            parsed.data.control_stddev_value !== undefined
              ? (parsed.data.control_stddev_value ?? null)
              : existing.control_stddev_value,
          p_variant_sample_size:
            parsed.data.variant_sample_size !== undefined
              ? (parsed.data.variant_sample_size ?? null)
              : existing.variant_sample_size,
          p_variant_success_count:
            parsed.data.variant_success_count !== undefined
              ? (parsed.data.variant_success_count ?? null)
              : existing.variant_success_count,
          p_variant_metric_value:
            parsed.data.variant_metric_value !== undefined
              ? (parsed.data.variant_metric_value ?? null)
              : existing.variant_metric_value,
          p_variant_stddev_value:
            parsed.data.variant_stddev_value !== undefined
              ? (parsed.data.variant_stddev_value ?? null)
              : existing.variant_stddev_value,
          p_readout_notes:
            parsed.data.readout_notes !== undefined
              ? (parsed.data.readout_notes ?? null)
              : existing.readout_notes,
        }),
      });

      if (!updateRes.ok) {
        logger.error({ status: updateRes.status }, "Experiment update failed");
        return NextResponse.json({ error: "Unable to update experiment." }, { status: 500 });
      }

      await logAdminAction({
        admin_email: admin.email,
        action: "update_experiment",
        resource_type: "admin_experiment",
        resource_id: String(parsed.data.experimentId),
        metadata: {
          fields: [
            ...Object.keys(parsed.data),
            "primary_metric_key",
            "guardrail_metric_keys",
          ].filter((field, index, fields) => fields.indexOf(field) === index),
        },
        ip,
      });

      return NextResponse.json({ success: true });
    }

    const deleteRes = await supabaseFetch(
      `/rest/v1/admin_experiment?id=eq.${parsed.data.experimentId}`,
      {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      }
    );
    if (!deleteRes.ok) {
      logger.error({ status: deleteRes.status }, "Experiment delete failed");
      return NextResponse.json({ error: "Unable to delete experiment." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "delete_experiment",
      resource_type: "admin_experiment",
      resource_id: String(parsed.data.experimentId),
      metadata: {},
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Experiments POST error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
