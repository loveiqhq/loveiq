import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import logger from "@/lib/logger";

interface BehaviorEvent {
  session_id: string;
  q_id: string;
  question_index: number;
  time_spent_ms: number | null;
  answered: boolean;
  direction: string;
  event_time: string;
}

interface SessionRisk {
  sessionId: string;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  factors: string[];
  currentIndex: number;
  totalEvents: number;
  backtracks: number;
  avgTimeMs: number;
  lastActivity: string;
  completed: boolean;
  abandoned: boolean;
}

function computeRiskScore(events: BehaviorEvent[]): SessionRisk {
  const sessionId = events[0].session_id;
  const backtracks = events.filter((e) => e.direction === "back").length;
  const forwards = events.filter((e) => e.direction === "forward").length;
  const completed = events.some((e) => e.direction === "complete");
  const abandoned = events.some((e) => e.direction === "abandon");
  const maxIndex = Math.max(...events.map((e) => e.question_index));
  const times = events.map((e) => e.time_spent_ms || 0).filter((t) => t > 0);
  const avgTimeMs = times.length > 0 ? times.reduce((s, t) => s + t, 0) / times.length : 0;
  const lastEvent = events[events.length - 1];

  const factors: string[] = [];
  let risk = 0;

  // Factor 1: Backtrack rate (more backtracks = higher risk)
  if (forwards + backtracks > 0) {
    const backtrackRate = backtracks / (forwards + backtracks);
    if (backtrackRate > 0.4) {
      risk += 30;
      factors.push("Very high backtrack rate");
    } else if (backtrackRate > 0.2) {
      risk += 15;
      factors.push("Elevated backtrack rate");
    }
  }

  // Factor 2: Slow progress (many events but low question index)
  if (events.length > 20 && maxIndex < 15) {
    risk += 25;
    factors.push("Slow progress through survey");
  }

  // Factor 3: Very long time per question (>60s avg)
  if (avgTimeMs > 60_000) {
    risk += 20;
    factors.push("Very long response times");
  } else if (avgTimeMs > 30_000) {
    risk += 10;
    factors.push("Slow response times");
  }

  // Factor 4: Early stage with many events (struggling)
  if (maxIndex < 10 && events.length > 10) {
    risk += 15;
    factors.push("Struggling in early questions");
  }

  // Factor 5: Recent inactivity (>10 min since last event)
  const lastActivityTime = new Date(lastEvent.event_time).getTime();
  const minutesSinceActivity = (Date.now() - lastActivityTime) / 60_000;
  if (minutesSinceActivity > 30) {
    risk += 20;
    factors.push("Inactive for 30+ minutes");
  } else if (minutesSinceActivity > 10) {
    risk += 10;
    factors.push("Inactive for 10+ minutes");
  }

  // Already completed = no risk
  if (completed) {
    risk = 0;
    factors.length = 0;
    factors.push("Session completed successfully");
  }

  // Already abandoned = max risk (historical)
  if (abandoned && !completed) {
    risk = 100;
    factors.length = 0;
    factors.push("Session was abandoned");
  }

  risk = Math.min(100, Math.max(0, risk));
  const riskLevel: SessionRisk["riskLevel"] =
    risk >= 70 ? "critical" : risk >= 45 ? "high" : risk >= 20 ? "medium" : "low";

  return {
    sessionId,
    riskScore: risk,
    riskLevel,
    factors,
    currentIndex: maxIndex,
    totalEvents: events.length,
    backtracks,
    avgTimeMs: Math.round(avgTimeMs),
    lastActivity: lastEvent.event_time,
    completed,
    abandoned,
  };
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
    bucket: "admin-risk-score",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  try {
    const res = await supabaseFetch(
      `/rest/v1/survey_behavior_event?select=session_id,q_id,question_index,time_spent_ms,answered,direction,event_time&order=event_time.asc`,
      { headers: { Range: "0-49999" } }
    );

    if (!res.ok) {
      logger.error("Risk score: Supabase query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const events = (await res.json()) as BehaviorEvent[];

    // Group by session
    const sessionMap = new Map<string, BehaviorEvent[]>();
    for (const e of events) {
      const arr = sessionMap.get(e.session_id) || [];
      arr.push(e);
      sessionMap.set(e.session_id, arr);
    }

    const sessions = Array.from(sessionMap.values())
      .map(computeRiskScore)
      .sort((a, b) => b.riskScore - a.riskScore);

    const distribution = {
      critical: sessions.filter((s) => s.riskLevel === "critical").length,
      high: sessions.filter((s) => s.riskLevel === "high").length,
      medium: sessions.filter((s) => s.riskLevel === "medium").length,
      low: sessions.filter((s) => s.riskLevel === "low").length,
    };

    const avgRisk =
      sessions.length > 0
        ? Math.round(sessions.reduce((s, r) => s + r.riskScore, 0) / sessions.length)
        : 0;

    return NextResponse.json({
      sessions,
      totalSessions: sessions.length,
      avgRiskScore: avgRisk,
      distribution,
    });
  } catch (err) {
    logger.error({ err }, "Risk score error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
