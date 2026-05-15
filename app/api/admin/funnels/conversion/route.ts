import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@/lib/logger";

interface FunnelStage {
  name: string;
  count: number;
}

function normalizeFunnelStages(raw: unknown): FunnelStage[] {
  const rawStages = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { stages?: unknown }).stages)
      ? (raw as { stages: unknown[] }).stages
      : [];

  return rawStages.flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    const name =
      typeof (item as { name?: unknown }).name === "string" ? (item as { name: string }).name : "";
    const countValue = Number((item as { count?: unknown }).count ?? 0);

    if (!name) return [];

    return [
      {
        name,
        count: Number.isFinite(countValue) ? countValue : 0,
      },
    ];
  });
}

function toStageMap(stages: FunnelStage[]) {
  return new Map(stages.map((stage) => [stage.name, stage.count]));
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
    bucket: "admin-funnels-conversion",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const utm = url.searchParams.get("utm") || "";

  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();
  const previousSince =
    days > 0 ? new Date(Date.now() - days * 2 * 86_400_000).toISOString() : null;

  try {
    const currentRes = await supabaseFetch("/rest/v1/rpc/get_conversion_funnel", {
      method: "POST",
      body: JSON.stringify({ since_ts: since, utm_filter: utm || null }),
    });

    if (!currentRes.ok) {
      logger.error({ currentStatus: currentRes.status }, "Admin funnels conversion query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const currentStages = normalizeFunnelStages(await currentRes.json());
    const sampleSize = currentStages[0]?.count ?? 0;
    if (days <= 0 || !previousSince) {
      return NextResponse.json({
        stages: currentStages,
        previousStages: [],
        anomalies: [],
        trust: {
          sampleSize,
          warning: sampleSize < 20 ? "Funnel counts are based on a small all-time sample." : null,
          comparisonAvailable: false,
          comparisonMessage:
            "Change detection requires a bounded time window such as 7d, 30d, or 90d.",
        },
      });
    }

    const previousRes = await supabaseFetch("/rest/v1/rpc/get_conversion_funnel", {
      method: "POST",
      body: JSON.stringify({ since_ts: previousSince, utm_filter: utm || null }),
    });

    if (!previousRes.ok) {
      logger.error(
        { currentStatus: currentRes.status, previousStatus: previousRes.status },
        "Admin funnels conversion previous-window query failed"
      );
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const previousAggregateStages = normalizeFunnelStages(await previousRes.json());
    const currentMap = toStageMap(currentStages);
    const previousAggregateMap = toStageMap(previousAggregateStages);
    const previousStages = [...previousAggregateMap.entries()].map(([name, count]) => ({
      name,
      count: Math.max(0, count - (currentMap.get(name) ?? 0)),
    }));
    const previousMap = toStageMap(previousStages);
    const allStageNames = [...new Set([...currentMap.keys(), ...previousMap.keys()])];
    const anomalies = allStageNames
      .map((name) => {
        const currentCount = currentMap.get(name) ?? 0;
        const previousCount = previousMap.get(name) ?? 0;
        const deltaPct =
          previousCount > 0
            ? Math.round(((currentCount - previousCount) / previousCount) * 100)
            : currentCount > 0
              ? 100
              : 0;

        return {
          stage: name,
          currentCount,
          previousCount,
          deltaPct,
          severity: deltaPct <= -15 ? "warning" : deltaPct >= 15 ? "positive" : "neutral",
        };
      })
      .filter((item) => Math.abs(item.deltaPct) >= 15)
      .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

    return NextResponse.json({
      stages: currentStages,
      previousStages,
      anomalies,
      trust: {
        sampleSize,
        warning:
          sampleSize < 20 ? "Funnel deltas are based on a small current-window sample." : null,
        comparisonAvailable: true,
        comparisonMessage: null,
      },
    });
  } catch (err) {
    logger.error({ err }, "Admin funnels conversion error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
