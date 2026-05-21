import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface BehaviorEvent {
  session_id: string;
  q_id: string;
  chapter: string;
  question_index: number;
  time_spent_ms: number | null;
  answered: boolean;
  direction: string;
  event_time: string;
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
    bucket: "admin-replay",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  try {
    if (sessionId) {
      // Detail mode: all events for a specific session
      const res = await supabaseFetch(
        `/rest/v1/survey_behavior_event?select=q_id,chapter,question_index,time_spent_ms,answered,direction,event_time&session_id=eq.${sessionId}&order=event_time.asc`,
        { headers: { Range: "0-9999" } }
      );
      if (!res.ok) {
        logger.error("Replay: session detail query failed");
        return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
      }
      const events = (await res.json()) as Omit<BehaviorEvent, "session_id">[];
      return NextResponse.json({
        sessionId,
        events: events.map((e) => ({
          qId: e.q_id,
          chapter: e.chapter,
          questionIndex: e.question_index,
          timeSpentMs: e.time_spent_ms,
          answered: e.answered,
          direction: e.direction,
          eventTime: e.event_time,
        })),
      });
    }

    // List mode: all sessions with summary stats
    const res = await supabaseFetch(
      `/rest/v1/survey_behavior_event?select=session_id,q_id,direction,time_spent_ms,answered,event_time,question_index&order=event_time.asc`,
      { headers: { Range: "0-49999" } }
    );
    if (!res.ok) {
      logger.error("Replay: session list query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }
    const allEvents = (await res.json()) as BehaviorEvent[];

    // Group by session_id
    const sessionMap = new Map<string, BehaviorEvent[]>();
    for (const e of allEvents) {
      const arr = sessionMap.get(e.session_id) || [];
      arr.push(e);
      sessionMap.set(e.session_id, arr);
    }

    const sessions = Array.from(sessionMap.entries()).map(([sid, events]) => {
      const totalTimeMs = events.reduce((sum, e) => sum + (e.time_spent_ms || 0), 0);
      const maxQ = Math.max(...events.map((e) => e.question_index));
      const completed = events.some((e) => e.direction === "complete");
      const abandoned = events.some((e) => e.direction === "abandon");
      const backtracks = events.filter((e) => e.direction === "back").length;
      return {
        sessionId: sid,
        eventCount: events.length,
        // events.length is verified non-zero by the caller's filter; first/last defined.
        firstEvent: events[0]!.event_time,
        lastEvent: events[events.length - 1]!.event_time,
        totalTimeMs,
        maxQuestionReached: maxQ,
        backtracks,
        completed,
        abandoned,
      };
    });

    // Sort by most recent first
    sessions.sort((a, b) => new Date(b.firstEvent).getTime() - new Date(a.firstEvent).getTime());

    const clusters = new Map<
      string,
      {
        label: string;
        likelyCause: string;
        sessions: number;
        abandoned: number;
        avgDurationMs: number;
        maxQuestionReached: number;
      }
    >();

    for (const session of sessions) {
      const label = session.completed
        ? "Completed Cleanly"
        : session.abandoned && session.maxQuestionReached <= 10
          ? "Early Abandon"
          : session.abandoned && session.backtracks >= 4
            ? "Backtrack Loop"
            : session.totalTimeMs >= 300_000
              ? "Slow-Step Stall"
              : "Late-Stage Friction";
      const likelyCause =
        label === "Early Abandon"
          ? "Early value communication or acquisition mismatch"
          : label === "Backtrack Loop"
            ? "Question confusion or answer uncertainty"
            : label === "Slow-Step Stall"
              ? "High cognitive load or technical hesitation"
              : label === "Late-Stage Friction"
                ? "Sensitive late questions or commitment friction"
                : "Healthy completion pattern";

      const current = clusters.get(label) ?? {
        label,
        likelyCause,
        sessions: 0,
        abandoned: 0,
        avgDurationMs: 0,
        maxQuestionReached: 0,
      };
      current.sessions += 1;
      if (session.abandoned) current.abandoned += 1;
      current.avgDurationMs += session.totalTimeMs;
      current.maxQuestionReached = Math.max(current.maxQuestionReached, session.maxQuestionReached);
      clusters.set(label, current);
    }

    return NextResponse.json({
      sessions,
      clusters: [...clusters.values()]
        .map((cluster) => ({
          ...cluster,
          avgDurationMs:
            cluster.sessions > 0 ? Math.round(cluster.avgDurationMs / cluster.sessions) : 0,
          abandonmentRate:
            cluster.sessions > 0 ? Math.round((cluster.abandoned / cluster.sessions) * 100) : 0,
        }))
        .sort((a, b) => b.sessions - a.sessions),
      totalSessions: sessions.length,
    });
  } catch (err) {
    logger.error({ err }, "Replay dashboard error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
