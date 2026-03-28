import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface PartialSave {
  id: number;
  session_id: string;
  answers: Record<string, unknown> | null;
  current_index: number;
  started_at: string;
  saved_at: string;
  utm_tracker: string | null;
}

interface BehaviorEvent {
  q_id: string;
  chapter: string;
  direction: string;
  event_time: string;
  session_id: string;
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
    bucket: "admin-abandonment",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "0", 10);
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

  try {
    const sinceFilter = since ? `&saved_at=gte.${since}` : "";
    const sinceFilterEvent = since ? `&event_time=gte.${since}` : "";

    const [partialsRes, abandonsRes, completedRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_partial_save?select=id,session_id,answers,current_index,started_at,saved_at,utm_tracker&order=saved_at.desc${sinceFilter}`,
        { headers: { Range: "0-999" } }
      ),
      supabaseFetch(
        `/rest/v1/survey_behavior_event?select=q_id,chapter,direction,event_time,session_id&direction=eq.abandon${sinceFilterEvent}`,
        { headers: { Range: "0-9999" } }
      ),
      supabaseFetch(
        `/rest/v1/survey_submission?select=id&status=eq.completed${since ? `&created_date_time=gte.${since}` : ""}`,
        { headers: { Prefer: "count=exact", Range: "0-0" } }
      ),
    ]);

    if (!partialsRes.ok || !abandonsRes.ok || !completedRes.ok) {
      logger.error("Abandonment: one or more Supabase queries failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const partials = (await partialsRes.json()) as PartialSave[];
    const abandons = (await abandonsRes.json()) as BehaviorEvent[];
    const totalCompleted = parseInt(
      completedRes.headers.get("content-range")?.split("/")[1] || "0",
      10
    );

    // Build partial save list
    const partialSaves = partials.map((p) => {
      const answersCount = p.answers ? Object.keys(p.answers).length : 0;
      const startMs = new Date(p.started_at).getTime();
      const saveMs = new Date(p.saved_at).getTime();
      const durationMin = Math.round(((saveMs - startMs) / 60_000) * 10) / 10;
      return {
        id: p.id,
        sessionId: p.session_id,
        currentIndex: p.current_index,
        startedAt: p.started_at,
        savedAt: p.saved_at,
        utmTracker: p.utm_tracker,
        answersCount,
        durationMin: durationMin > 0 ? durationMin : 0,
      };
    });

    // Kill questions — group abandon events by q_id
    const killMap: Record<string, { count: number; chapter: string }> = {};
    for (const e of abandons) {
      if (!killMap[e.q_id]) killMap[e.q_id] = { count: 0, chapter: e.chapter };
      killMap[e.q_id].count++;
    }
    const killQuestions = Object.entries(killMap)
      .map(([qId, { count, chapter }]) => ({ qId, abandonCount: count, chapter }))
      .sort((a, b) => b.abandonCount - a.abandonCount);

    // Average progress before abandon
    const totalProgress = partials.reduce((sum, p) => sum + p.current_index, 0);
    const avgProgress =
      partials.length > 0 ? Math.round((totalProgress / partials.length) * 10) / 10 : 0;

    // Hourly abandon pattern
    const hourMap: Record<number, number> = {};
    for (const e of abandons) {
      const hour = new Date(e.event_time).getUTCHours();
      hourMap[hour] = (hourMap[hour] || 0) + 1;
    }
    const hourlyPattern = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourMap[h] || 0,
    }));

    const totalPartialSaves = partials.length;
    const totalAttempts = totalPartialSaves + totalCompleted;
    const abandonmentRate =
      totalAttempts > 0 ? Math.round((totalPartialSaves / totalAttempts) * 100) : 0;

    return NextResponse.json({
      partialSaves,
      killQuestions,
      totalPartialSaves,
      totalCompleted,
      abandonmentRate,
      avgProgressBeforeAbandon: avgProgress,
      hourlyPattern,
    });
  } catch (err) {
    logger.error({ err }, "Abandonment dashboard error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
