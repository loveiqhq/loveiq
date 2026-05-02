import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasRole(admin.role, "viewer"))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, { bucket: "admin-pipeline", limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Please try again later." }, { status: 429 });

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();

  try {
    const res = await supabaseFetch("/rest/v1/rpc/get_conversion_pipeline", {
      method: "POST",
      body: JSON.stringify({ since_ts: since }),
    });
    if (!res.ok) {
      logger.error("Pipeline: RPC failed");
      return NextResponse.json({ error: "Unable to load pipeline." }, { status: 500 });
    }

    const raw = await res.json();

    const stageOrder = [
      { key: "waitlist_signups", label: "Waitlist Signups" },
      { key: "survey_started", label: "Survey Started" },
      { key: "survey_completed", label: "Survey Completed" },
      { key: "scored", label: "Scored" },
      { key: "report_generated", label: "Report Generated" },
      { key: "report_viewed", label: "Report Viewed" },
      { key: "payment_completed", label: "Payment Completed" },
    ];

    const rawStages =
      raw?.stages && typeof raw.stages === "object" && !Array.isArray(raw.stages)
        ? new Map(Object.entries(raw.stages as Record<string, unknown>))
        : new Map<string, unknown>();
    const stages = stageOrder.map((s) => ({
      label: s.label,
      value: Number(rawStages.get(s.key) ?? 0),
    }));

    const conversionRates = [];
    for (const [index, from] of stages.entries()) {
      const to = stages.at(index + 1);
      if (!to) continue;
      conversionRates.push({
        from: from.label,
        to: to.label,
        rate: from.value > 0 ? Math.round((to.value / from.value) * 100) : 0,
      });
    }

    const tc = raw.time_to_complete ?? {};
    const byUtm = (raw.by_utm ?? []).map(
      (u: { source: string; total: number; completed: number; conversion_rate: number }) => ({
        source: u.source,
        total: u.total,
        completed: u.completed,
        conversionRate: u.conversion_rate ?? 0,
      })
    );

    const dailyTrend = (raw.daily_funnel ?? []).map(
      (d: {
        date: string;
        waitlist: number;
        survey_started: number;
        survey_completed: number;
      }) => ({
        date: d.date,
        waitlist: d.waitlist ?? 0,
        started: d.survey_started ?? 0,
        completed: d.survey_completed ?? 0,
      })
    );

    return NextResponse.json({
      stages,
      conversionRates,
      avgTimeToComplete: tc.avg_hours ?? 0,
      medianTimeToComplete: tc.median_hours ?? 0,
      utmSources: byUtm,
      dailyTrend,
    });
  } catch (err) {
    logger.error({ err }, "Pipeline error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
