import { NextResponse } from "next/server";
import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@features/admin/server/supabase";
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
  totalTimeMs: number;
  backtracks: number;
  avgTimeMs: number;
  lastActivity: string;
  completed: boolean;
  abandoned: boolean;
}

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "yopmail.com",
  "tempmail.com",
  "guerrillamail.com",
  "10minutemail.com",
]);

function computeRiskScore(events: BehaviorEvent[]): SessionRisk {
  // Callers only invoke this with non-empty `events`; first/last are defined.
  const sessionId = events[0]!.session_id;
  const backtracks = events.filter((e) => e.direction === "back").length;
  const forwards = events.filter((e) => e.direction === "forward").length;
  const completed = events.some((e) => e.direction === "complete");
  const abandoned = events.some((e) => e.direction === "abandon");
  const maxIndex = Math.max(...events.map((e) => e.question_index));
  const times = events.map((e) => e.time_spent_ms || 0).filter((t) => t > 0);
  const avgTimeMs = times.length > 0 ? times.reduce((s, t) => s + t, 0) / times.length : 0;
  const totalTimeMs = times.reduce((sum, value) => sum + value, 0);
  const lastEvent = events[events.length - 1]!;

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
    totalTimeMs,
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
    const [eventsRes, submissionsRes, usersRes, partialsRes] = await Promise.all([
      supabaseFetch(
        `/rest/v1/survey_behavior_event?select=session_id,q_id,question_index,time_spent_ms,answered,direction,event_time,client_ip&order=event_time.asc`,
        { headers: { Range: "0-49999" } }
      ),
      supabaseFetch(
        `/rest/v1/survey_submission?select=id,user_id,session_id,status,created_date_time`,
        {
          headers: { Range: "0-49999" },
        }
      ),
      supabaseFetch(`/rest/v1/app_user?select=id,email`, {
        headers: { Range: "0-49999" },
      }),
      supabaseFetch(`/rest/v1/survey_partial_save?select=session_id,answers,client_ip`, {
        headers: { Range: "0-49999" },
      }),
    ]);

    if (!eventsRes.ok || !submissionsRes.ok || !usersRes.ok || !partialsRes.ok) {
      logger.error("Risk score: Supabase query failed");
      return NextResponse.json({ error: "Unable to load data." }, { status: 500 });
    }

    const events = (await eventsRes.json()) as Array<
      BehaviorEvent & {
        client_ip: string | null;
      }
    >;
    const submissions = (await submissionsRes.json()) as Array<{
      id: number;
      user_id: number | null;
      session_id: string | null;
      status: string;
      created_date_time: string;
    }>;
    const users = (await usersRes.json()) as Array<{ id: number; email: string | null }>;
    const partials = (await partialsRes.json()) as Array<{
      session_id: string;
      answers: Record<string, unknown> | null;
      client_ip: string | null;
    }>;

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

    const submissionBySession = new Map(
      submissions
        .filter((submission) => submission.session_id)
        .map((submission) => [submission.session_id as string, submission])
    );
    const emailByUserId = new Map(users.map((user) => [user.id, user.email]));
    const partialBySession = new Map(partials.map((partial) => [partial.session_id, partial]));

    const ipCounts = new Map<string, number>();
    for (const event of events) {
      if (!event.client_ip) continue;
      ipCounts.set(event.client_ip, (ipCounts.get(event.client_ip) ?? 0) + 1);
    }

    const answerSignatureCounts = new Map<string, number>();
    for (const partial of partials) {
      const signature = JSON.stringify(partial.answers ?? {});
      answerSignatureCounts.set(signature, (answerSignatureCounts.get(signature) ?? 0) + 1);
    }

    const fraudSignals = sessions
      .map((session) => {
        const submission = submissionBySession.get(session.sessionId);
        const email = submission?.user_id ? (emailByUserId.get(submission.user_id) ?? null) : null;
        const partial = partialBySession.get(session.sessionId);
        const recentEvent = events.find((event) => event.session_id === session.sessionId);
        const clientIp = recentEvent?.client_ip ?? partial?.client_ip ?? null;
        const reasons: string[] = [];
        let fraudScore = 0;

        if (clientIp && (ipCounts.get(clientIp) ?? 0) >= 12) {
          fraudScore += 30;
          reasons.push("Shared IP across many survey sessions");
        }

        if (email) {
          const domain = email.split("@")[1]?.toLowerCase() ?? "";
          if (DISPOSABLE_DOMAINS.has(domain)) {
            fraudScore += 35;
            reasons.push("Disposable email domain");
          }
        }

        if (
          session.totalEvents >= 12 &&
          session.totalTimeMs / Math.max(session.totalEvents, 1) < 1500
        ) {
          fraudScore += 20;
          reasons.push("Answer velocity is unusually fast");
        }

        const signature = JSON.stringify(partial?.answers ?? {});
        if (partial && (answerSignatureCounts.get(signature) ?? 0) >= 3) {
          fraudScore += 25;
          reasons.push("Duplicate partial-answer signature");
        }

        return {
          sessionId: session.sessionId,
          submissionId: submission?.id ?? null,
          email,
          clientIp,
          fraudScore: Math.min(100, fraudScore),
          reasons,
          reviewState: fraudScore >= 40 ? "review" : "monitor",
        };
      })
      .filter((signal) => signal.fraudScore > 0)
      .sort((a, b) => b.fraudScore - a.fraudScore);

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
      fraudSummary: {
        reviewQueue: fraudSignals.filter((signal) => signal.fraudScore >= 40).length,
        duplicateIpGroups: [...ipCounts.values()].filter((count) => count >= 12).length,
        disposableEmails: fraudSignals.filter((signal) =>
          signal.reasons.includes("Disposable email domain")
        ).length,
        duplicateAnswerPatterns: fraudSignals.filter((signal) =>
          signal.reasons.includes("Duplicate partial-answer signature")
        ).length,
      },
      fraudSignals: fraudSignals.slice(0, 25),
    });
  } catch (err) {
    logger.error({ err }, "Risk score error");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
