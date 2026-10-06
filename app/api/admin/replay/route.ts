import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import { fetchAllRows, supabaseFetch } from "@features/admin/server/supabase";
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

    /**
     * List mode: recent sessions with summary stats.
     *
     * This read the table with no filter and `order=event_time.asc` behind
     * `Range: "0-49999"`. PostgREST caps a response at 1,000 rows with no
     * error, so the list was built from the OLDEST thousand events of
     * 133,753 — a fixed nine-day slice from the product's launch. Every
     * session an admin could open here was from that window, and no session
     * recorded since has ever appeared.
     *
     * Newest first and paged, bounded by a window instead of by an invisible
     * cap. Fourteen days by default, `?days=` clamped to 90.
     */
    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 14, 1), 90);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const allEvents = await fetchAllRows<BehaviorEvent>(
      `/rest/v1/survey_behavior_event?select=session_id,q_id,direction,time_spent_ms,answered,event_time,question_index&event_time=gte.${since}&order=event_time.desc`
    );
    if (allEvents === null) {
      logger.error("Replay: session list query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

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
      // Computed by min/max rather than by position. The query used to be
      // `event_time.asc`, so events[0] was genuinely the first — reading them
      // positionally silently swaps them the moment the order changes, which
      // it just did. min/max is right under either order.
      const times = events.map((e) => e.event_time).sort();
      return {
        sessionId: sid,
        eventCount: events.length,
        // events.length is verified non-zero by the caller's filter; first/last defined.
        firstEvent: times[0]!,
        lastEvent: times[times.length - 1]!,
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
