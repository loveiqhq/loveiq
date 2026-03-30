import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { ADMIN_METRIC_OPTIONS, fetchMetricValue } from "@/lib/admin/metric-library";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const experimentStatusSchema = z.enum(["draft", "active", "paused", "completed", "archived"]);

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
  });

const deleteSchema = z.object({
  action: z.literal("delete"),
  experimentId: z.number().int().positive(),
});

const postSchema = z.discriminatedUnion("action", [createSchema, updateSchema, deleteSchema]);

const experimentSelect = [
  "id",
  "name",
  "hypothesis",
  "owner_email",
  "segment_id",
  "primary_metric_key",
  "status",
  "start_date",
  "decision_date",
  "expected_impact",
  "result_summary",
  "outcome",
  "created_at",
  "updated_at",
  "admin_email",
  "admin_experiment_metric(metric_key,metric_role)",
].join(",");

type ExperimentMetricRow = {
  metric_key: string;
  metric_role: "primary" | "guardrail";
};

type ExperimentRow = {
  id: number;
  name: string;
  hypothesis: string;
  owner_email: string | null;
  segment_id: number | null;
  primary_metric_key: string;
  status: z.infer<typeof experimentStatusSchema>;
  start_date: string | null;
  decision_date: string | null;
  expected_impact: string | null;
  result_summary: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
  admin_email: string;
  admin_experiment_metric?: ExperimentMetricRow[] | null;
};

function normalizeGuardrails(primaryMetricKey: string, guardrailMetricKeys: string[] | undefined) {
  return [...new Set((guardrailMetricKeys ?? []).map((key) => key.trim()).filter(Boolean))].filter(
    (key) => key !== primaryMetricKey
  );
}

function normalizeExperimentMetrics(experiment: ExperimentRow) {
  const metricRows = experiment.admin_experiment_metric ?? [];
  const primaryMetricKey =
    metricRows.find((row) => row.metric_role === "primary")?.metric_key ??
    experiment.primary_metric_key;
  const guardrailMetricKeys = normalizeGuardrails(
    primaryMetricKey,
    metricRows.filter((row) => row.metric_role === "guardrail").map((row) => row.metric_key)
  );

  return { primaryMetricKey, guardrailMetricKeys };
}

async function loadExperiment(experimentId: number) {
  const response = await supabaseFetch(
    `/rest/v1/admin_experiment?id=eq.${experimentId}&select=${experimentSelect}`,
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
    const [experimentsRes, segmentsRes] = await Promise.all([
      supabaseFetch(`/rest/v1/admin_experiment?select=${experimentSelect}&order=updated_at.desc`, {
        headers: { Range: "0-999" },
      }),
      supabaseFetch(
        `/rest/v1/admin_segment?or=(admin_email.eq.${encodeURIComponent(admin.email)},is_shared.eq.true)&select=id,name&order=name.asc`,
        { headers: { Range: "0-999" } }
      ),
    ]);

    if (!experimentsRes.ok || !segmentsRes.ok) {
      logger.error(
        { statuses: [experimentsRes.status, segmentsRes.status] },
        "Experiments query failed"
      );
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const experiments = (await experimentsRes.json()) as ExperimentRow[];
    const segments = (await segmentsRes.json()) as Array<{ id: number; name: string }>;
    const segmentMap = new Map(segments.map((segment) => [segment.id, segment.name]));
    const normalizedExperiments = experiments.map((experiment) => {
      const metrics = normalizeExperimentMetrics(experiment);
      return {
        ...experiment,
        primary_metric_key: metrics.primaryMetricKey,
        guardrail_metric_keys: metrics.guardrailMetricKeys,
      };
    });

    const metricKeys = [
      ...new Set(normalizedExperiments.map((experiment) => experiment.primary_metric_key)),
    ];
    const metricValues: Record<string, number | null> = {};
    await Promise.all(
      metricKeys.map(async (key) => {
        metricValues[key] = await fetchMetricValue(key);
      })
    );

    return NextResponse.json({
      summary: {
        total: normalizedExperiments.length,
        active: normalizedExperiments.filter((experiment) => experiment.status === "active").length,
        completed: normalizedExperiments.filter((experiment) => experiment.status === "completed")
          .length,
        pendingDecision: normalizedExperiments.filter(
          (experiment) =>
            experiment.status !== "archived" &&
            experiment.decision_date != null &&
            experiment.decision_date <= new Date().toISOString().slice(0, 10)
        ).length,
      },
      experiments: normalizedExperiments.map((experiment) => ({
        ...experiment,
        segment_name: experiment.segment_id
          ? (segmentMap.get(experiment.segment_id) ?? null)
          : null,
        metric_value: metricValues[experiment.primary_metric_key] ?? null,
      })),
      segments,
      metrics: ADMIN_METRIC_OPTIONS,
    });
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
