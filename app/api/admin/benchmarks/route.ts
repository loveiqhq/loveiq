import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import {
  ADMIN_METRIC_OPTIONS,
  fetchMetricValue,
  loadBenchmarkDefinitions,
} from "@/lib/admin/metric-library";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const createSchema = z.object({
  action: z.literal("create"),
  metric_key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  source_name: z.string().trim().min(1).max(120),
  source_url: z.string().trim().url().optional().nullable(),
  benchmark_type: z.enum(["internal", "category", "competitive"]),
  target_value: z.number().positive(),
  warning_value: z.number().positive(),
  direction: z.enum(["higher", "lower"]),
  unit: z.enum(["percent", "minutes", "count"]),
  is_active: z.boolean().optional(),
});

const updateSchema = createSchema
  .extend({
    action: z.literal("update"),
    benchmarkId: z.number().int().positive(),
  })
  .partial({
    metric_key: true,
    label: true,
    description: true,
    source_name: true,
    source_url: true,
    benchmark_type: true,
    target_value: true,
    warning_value: true,
    direction: true,
    unit: true,
    is_active: true,
  });

const deleteSchema = z.object({
  action: z.literal("delete"),
  benchmarkId: z.number().int().positive(),
});

const postSchema = z.discriminatedUnion("action", [createSchema, updateSchema, deleteSchema]);

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
    bucket: "admin-benchmarks",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const [benchmarksRes, mergedDefinitions] = await Promise.all([
      supabaseFetch("/rest/v1/admin_metric_benchmark?select=*&order=updated_at.desc", {
        headers: { Range: "0-999" },
      }),
      loadBenchmarkDefinitions(),
    ]);

    if (!benchmarksRes.ok) {
      logger.error({ status: benchmarksRes.status }, "Benchmarks query failed");
      return NextResponse.json({ error: "Unable to load benchmarks." }, { status: 500 });
    }

    const benchmarks = (await benchmarksRes.json()) as Array<{
      id: number;
      metric_key: string;
      label: string;
      description: string | null;
      source_name: string;
      source_url: string | null;
      benchmark_type: "internal" | "category" | "competitive";
      target_value: number;
      warning_value: number;
      direction: "higher" | "lower";
      unit: "percent" | "minutes" | "count";
      is_active: boolean;
      admin_email: string;
      created_at: string;
      updated_at: string;
    }>;

    const metricKeys = [...new Set(benchmarks.map((benchmark) => benchmark.metric_key))];
    const metricValues: Record<string, number | null> = {};
    await Promise.all(
      metricKeys.map(async (key) => {
        metricValues[key] = await fetchMetricValue(key);
      })
    );

    return NextResponse.json({
      benchmarks: benchmarks.map((benchmark) => ({
        ...benchmark,
        current_value: metricValues[benchmark.metric_key] ?? null,
      })),
      activeDefinitions: mergedDefinitions,
      metrics: ADMIN_METRIC_OPTIONS,
    });
  } catch (err) {
    logger.error({ err }, "Benchmarks GET error");
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
    bucket: "admin-benchmarks-write",
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
      const insertRes = await supabaseFetch("/rest/v1/admin_metric_benchmark", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ...parsed.data,
          admin_email: admin.email,
          description: parsed.data.description ?? null,
          source_url: parsed.data.source_url ?? null,
          is_active: parsed.data.is_active ?? true,
        }),
      });

      if (!insertRes.ok) {
        logger.error({ status: insertRes.status }, "Benchmark creation failed");
        return NextResponse.json({ error: "Unable to create benchmark." }, { status: 500 });
      }

      const created = (await insertRes.json()) as Array<{ id: number }>;
      await logAdminAction({
        admin_email: admin.email,
        action: "create_metric_benchmark",
        resource_type: "admin_metric_benchmark",
        resource_id: String(created[0]?.id ?? ""),
        metadata: { metric_key: parsed.data.metric_key },
        ip,
      });

      return NextResponse.json({ success: true, id: created[0]?.id });
    }

    if (parsed.data.action === "update") {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      for (const [key, value] of Object.entries(parsed.data)) {
        if (key === "action" || key === "benchmarkId") continue;
        patch[key] = value ?? null;
      }

      const updateRes = await supabaseFetch(
        `/rest/v1/admin_metric_benchmark?id=eq.${parsed.data.benchmarkId}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(patch),
        }
      );
      if (!updateRes.ok) {
        logger.error({ status: updateRes.status }, "Benchmark update failed");
        return NextResponse.json({ error: "Unable to update benchmark." }, { status: 500 });
      }

      await logAdminAction({
        admin_email: admin.email,
        action: "update_metric_benchmark",
        resource_type: "admin_metric_benchmark",
        resource_id: String(parsed.data.benchmarkId),
        metadata: { fields: Object.keys(patch) },
        ip,
      });

      return NextResponse.json({ success: true });
    }

    const deleteRes = await supabaseFetch(
      `/rest/v1/admin_metric_benchmark?id=eq.${parsed.data.benchmarkId}`,
      {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      }
    );
    if (!deleteRes.ok) {
      logger.error({ status: deleteRes.status }, "Benchmark delete failed");
      return NextResponse.json({ error: "Unable to delete benchmark." }, { status: 500 });
    }

    await logAdminAction({
      admin_email: admin.email,
      action: "delete_metric_benchmark",
      resource_type: "admin_metric_benchmark",
      resource_id: String(parsed.data.benchmarkId),
      metadata: {},
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Benchmarks POST error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
