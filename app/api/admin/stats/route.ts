import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { supabaseFetch } from "@/lib/admin/supabase";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

export async function GET(request: Request) {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-stats",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const [submissionsRes, behaviorRes, recentRes] = await Promise.all([
      // Total submissions & completion stats
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,status,created_date_time&created_date_time=gte.${since}`,
        { headers: { Prefer: "count=exact" } }
      ),
      // Drop-off by question (abandon events)
      supabaseFetch(
        `/rest/v1/survey_behavior_event?select=q_id,direction&direction=eq.abandon&event_time=gte.${since}`
      ),
      // Submissions over time (daily counts)
      supabaseFetch(
        `/rest/v1/survey_submission?select=created_date_time&created_date_time=gte.${since}&order=created_date_time.asc`
      ),
    ]);

    if (!submissionsRes.ok || !behaviorRes.ok || !recentRes.ok) {
      logger.error("Admin stats: one or more Supabase queries failed");
      return NextResponse.json({ error: "Unable to load stats." }, { status: 500 });
    }

    const totalCount = parseInt(
      submissionsRes.headers.get("content-range")?.split("/")[1] || "0",
      10
    );
    const submissions = (await submissionsRes.json()) as Array<{
      id: number;
      status: string;
      created_date_time: string;
    }>;

    const completed = submissions.filter((s) => s.status === "completed");
    const completionRate = totalCount > 0 ? Math.round((completed.length / totalCount) * 100) : 0;

    // Drop-off counts by question
    const abandonEvents = (await behaviorRes.json()) as Array<{ q_id: string }>;
    const dropOffMap: Record<string, number> = {};
    for (const e of abandonEvents) {
      dropOffMap[e.q_id] = (dropOffMap[e.q_id] || 0) + 1;
    }
    const dropOff = Object.entries(dropOffMap)
      .map(([qId, count]) => ({ qId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Daily submission counts
    const recentSubmissions = (await recentRes.json()) as Array<{ created_date_time: string }>;
    const dailyMap: Record<string, number> = {};
    for (const s of recentSubmissions) {
      const day = s.created_date_time.slice(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + 1;
    }
    const daily = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

    return NextResponse.json({
      totalSubmissions: totalCount,
      completionRate,
      dropOff,
      daily,
    });
  } catch (err) {
    logger.error({ err }, "Admin stats error");
    return NextResponse.json({ error: "Unable to load stats." }, { status: 500 });
  }
}
