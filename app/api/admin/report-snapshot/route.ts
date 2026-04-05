import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

function incrementCount<K>(map: Map<K, number>, key: K, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasRole(admin.role, "viewer"))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, { bucket: "admin-report", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Please try again later." }, { status: 429 });

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since =
    days > 0
      ? new Date(Date.now() - days * 86_400_000).toISOString()
      : new Date("2000-01-01").toISOString();

  try {
    const [subRes, wlRes, scoreRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,created_date_time,duration_ms&created_date_time=gte.${since}`,
        { headers: { Prefer: "count=exact", Range: "0-49999" } }
      ),
      supabaseFetch(`/rest/v1/waitlist_user?select=id&created_date_time=gte.${since}`, {
        headers: { Prefer: "count=exact" },
      }),
      // eslint-disable-next-line no-secrets/no-secrets
      supabaseFetch(`/rest/v1/scoring_result?select=primary_archetype,survey_submission_id`, {
        headers: { Range: "0-49999" },
      }),
    ]);

    const totalSub = parseInt(subRes.headers.get("content-range")?.split("/")[1] || "0", 10);
    const submissions: Array<{
      id: number;
      status: string;
      created_date_time: string;
      duration_ms: number | null;
    }> = subRes.ok ? await subRes.json() : [];
    const completed = submissions.filter((s) => s.status === "completed").length;
    const completionRate = totalSub > 0 ? Math.round((completed / totalSub) * 100) : 0;
    const durations = submissions
      .map((s) => s.duration_ms)
      .filter((d): d is number => d != null && d > 0);
    const avgDurationMin =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000)
        : null;

    const waitlistTotal = parseInt(wlRes.headers.get("content-range")?.split("/")[1] || "0", 10);

    const archetypes = new Map<string, number>();
    if (scoreRes.ok) {
      const scores: Array<{ primary_archetype: string }> = await scoreRes.json();
      for (const s of scores) {
        incrementCount(archetypes, s.primary_archetype);
      }
    }

    const dailyMap = new Map<string, number>();
    for (const s of submissions) {
      const day = s.created_date_time.slice(0, 10);
      incrementCount(dailyMap, day);
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      generatedBy: admin.email,
      period: { days, since },
      summary: {
        totalSubmissions: totalSub,
        completed,
        completionRate,
        avgDurationMin,
        waitlistTotal,
        scoredCount: [...archetypes.values()].reduce((a, b) => a + b, 0),
      },
      archetypeBreakdown: [...archetypes.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      dailyTrend: [...dailyMap.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (err) {
    logger.error({ err }, "Report snapshot error");
    return NextResponse.json({ error: "Unable to generate report." }, { status: 500 });
  }
}
