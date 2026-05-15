import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { supabaseFetch } from "@features/admin/server/supabase";
import {
  REPORT_PURCHASE_PLAN_IDS,
  type ReportPurchasePlanId,
} from "@features/checkout/server/reportPurchase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const querySchema = z.object({
  days: z.coerce.number().int().min(0).max(365).optional(),
  plan: z.enum(REPORT_PURCHASE_PLAN_IDS).optional(),
});

interface PricingMetricsRpcRow {
  plan: ReportPurchasePlanId;
  experiment_group: "A" | "B";
  pricing_cluster_id: string;
  base_price_bucket: string;
  country_tier: string;
  device_type: string;
  traffic_source: string;
  behavioral_bucket: string;
  engagement_band: string;
  discount_step: number;
  quoted_count: number;
  checkout_started_count: number;
  purchased_count: number;
  conversion_rate: number;
  revenue_eur: number;
  rpcs_eur: number;
  avg_initial_price_eur: number;
  avg_current_price_eur: number;
  avg_discount_multiplier: number;
  first_quote_at: string;
  last_quote_at: string;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
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
    bucket: "admin-revenue-pricing-clusters",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    days: url.searchParams.get("days") ?? undefined,
    plan: url.searchParams.get("plan") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const days = parsed.data.days ?? 0;
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  try {
    const rpcResponse = await supabaseFetch("/rest/v1/rpc/get_report_pricing_metrics", {
      method: "POST",
      body: JSON.stringify({
        plan_filter: parsed.data.plan ?? null,
        since_ts: since,
      }),
    });

    if (!rpcResponse.ok) {
      logger.error({ status: rpcResponse.status }, "Pricing metrics RPC failed");
      return NextResponse.json({ error: "Unable to load pricing metrics." }, { status: 500 });
    }

    const rpcRows = (await rpcResponse.json()) as PricingMetricsRpcRow[];
    const clusters = rpcRows.map((row) => ({
      avgCurrentPriceEur: round2(toNumber(row.avg_current_price_eur)),
      avgDiscountMultiplier: round2(toNumber(row.avg_discount_multiplier)),
      avgInitialPriceEur: round2(toNumber(row.avg_initial_price_eur)),
      basePriceBucket: row.base_price_bucket,
      behavioralBucket: row.behavioral_bucket,
      checkoutStartedCount: toNumber(row.checkout_started_count),
      conversionRatePct: round2(toNumber(row.conversion_rate)),
      countryTier: row.country_tier,
      deviceType: row.device_type,
      discountStep: toNumber(row.discount_step),
      engagementBand: row.engagement_band,
      experimentGroup: row.experiment_group,
      firstQuoteAt: row.first_quote_at,
      lastQuoteAt: row.last_quote_at,
      plan: row.plan,
      pricingClusterId: row.pricing_cluster_id,
      purchasedCount: toNumber(row.purchased_count),
      quotedCount: toNumber(row.quoted_count),
      revenueEur: round2(toNumber(row.revenue_eur)),
      rpcsEur: round2(toNumber(row.rpcs_eur)),
      trafficSource: row.traffic_source,
    }));

    const totals = clusters.reduce(
      (acc, cluster) => {
        acc.checkoutStartedCount += cluster.checkoutStartedCount;
        acc.purchasedCount += cluster.purchasedCount;
        acc.quotedCount += cluster.quotedCount;
        acc.revenueEur += cluster.revenueEur;
        return acc;
      },
      {
        checkoutStartedCount: 0,
        purchasedCount: 0,
        quotedCount: 0,
        revenueEur: 0,
      }
    );

    const experimentGroups = ["A", "B"].map((experimentGroup) => {
      const groupClusters = clusters.filter(
        (cluster) => cluster.experimentGroup === experimentGroup
      );
      const quotedCount = groupClusters.reduce((sum, cluster) => sum + cluster.quotedCount, 0);
      const purchasedCount = groupClusters.reduce(
        (sum, cluster) => sum + cluster.purchasedCount,
        0
      );
      const revenueEur = round2(
        groupClusters.reduce((sum, cluster) => sum + cluster.revenueEur, 0)
      );

      return {
        conversionRatePct: quotedCount > 0 ? round2((purchasedCount / quotedCount) * 100) : 0,
        experimentGroup,
        purchasedCount,
        quotedCount,
        revenueEur,
        rpcsEur: quotedCount > 0 ? round2(revenueEur / quotedCount) : 0,
      };
    });

    const plans = REPORT_PURCHASE_PLAN_IDS.map((plan) => {
      const planClusters = clusters.filter((cluster) => cluster.plan === plan);
      const quotedCount = planClusters.reduce((sum, cluster) => sum + cluster.quotedCount, 0);
      const purchasedCount = planClusters.reduce((sum, cluster) => sum + cluster.purchasedCount, 0);
      const revenueEur = round2(planClusters.reduce((sum, cluster) => sum + cluster.revenueEur, 0));

      return {
        conversionRatePct: quotedCount > 0 ? round2((purchasedCount / quotedCount) * 100) : 0,
        plan,
        purchasedCount,
        quotedCount,
        revenueEur,
        rpcsEur: quotedCount > 0 ? round2(revenueEur / quotedCount) : 0,
      };
    }).filter((entry) => entry.quotedCount > 0 || parsed.data.plan === entry.plan);

    return NextResponse.json({
      clusters,
      experimentGroups,
      meta: {
        planFilter: parsed.data.plan ?? null,
        totals: {
          checkoutStartedCount: totals.checkoutStartedCount,
          conversionRatePct:
            totals.quotedCount > 0 ? round2((totals.purchasedCount / totals.quotedCount) * 100) : 0,
          purchasedCount: totals.purchasedCount,
          quotedCount: totals.quotedCount,
          revenueEur: round2(totals.revenueEur),
          rpcsEur: totals.quotedCount > 0 ? round2(totals.revenueEur / totals.quotedCount) : 0,
        },
        windowDays: days,
        windowLabel: days > 0 ? `Last ${days} days` : "All time",
      },
      plans,
    });
  } catch (error) {
    logger.error({ error }, "Pricing metrics route failed");
    return NextResponse.json({ error: "Unable to load pricing metrics." }, { status: 500 });
  }
}
