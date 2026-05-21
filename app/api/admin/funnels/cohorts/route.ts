import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

const VALID_GROUP_BY = new Set(["week", "utm", "archetype"]);

interface CohortRow {
  label: string;
  total_users: number;
  survey_started: number;
  survey_completed: number;
  scored: number;
  invite_sent: number;
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
    bucket: "admin-funnels-cohorts",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const groupBy = url.searchParams.get("groupBy") || "week";

  if (!VALID_GROUP_BY.has(groupBy)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_cohort_analysis", {
      method: "POST",
      body: JSON.stringify({ since_ts: since, group_by_field: groupBy }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Admin funnels cohorts query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const rows = (await res.json()) as CohortRow[];
    const enriched = rows.map((row) => ({
      ...row,
      completion_rate:
        row.total_users > 0 ? Math.round((row.survey_completed / row.total_users) * 100) : 0,
    }));
    const strongest =
      [...enriched].sort((a, b) => b.completion_rate - a.completion_rate)[0] ?? null;
    const weakest = [...enriched].sort((a, b) => a.completion_rate - b.completion_rate)[0] ?? null;
    const sampleSize = rows.reduce((sum, row) => sum + row.total_users, 0);

    return NextResponse.json({
      rows,
      summary: {
        strongestCompletionLabel: strongest?.label ?? null,
        strongestCompletionRate: strongest?.completion_rate ?? null,
        weakestCompletionLabel: weakest?.label ?? null,
        weakestCompletionRate: weakest?.completion_rate ?? null,
      },
      trust: {
        sampleSize,
        warning:
          sampleSize < 20
            ? "Cohort analysis is directional only because the sample is small."
            : null,
      },
    });
  } catch (err) {
    logger.error({ err }, "Admin funnels cohorts error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
