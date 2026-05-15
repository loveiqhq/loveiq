import { clampDays } from "@features/admin/server/next-level";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

interface BehaviorEvent {
  session_id: string;
  question_index: number;
  time_spent_ms: number | null;
  direction: string;
  event_time: string;
}

interface ReplaySessionCluster {
  label: string;
  likelyCause: string;
  sessions: number;
  abandoned: number;
  avgDurationMs: number;
  maxQuestionReached: number;
  abandonmentRate: number;
  sampleSessionId: string | null;
}

export interface ReplayPathClustersSnapshot {
  generatedAt: string;
  days: number;
  totalSessions: number;
  clusters: ReplaySessionCluster[];
}

function clusterLabel(input: {
  completed: boolean;
  abandoned: boolean;
  backtracks: number;
  totalTimeMs: number;
  maxQuestionReached: number;
}) {
  if (input.completed) return "Completed Cleanly";
  if (input.abandoned && input.maxQuestionReached <= 10) return "Early Abandon";
  if (input.abandoned && input.backtracks >= 4) return "Backtrack Loop";
  if (input.totalTimeMs >= 300_000) return "Slow-Step Stall";
  return "Late-Stage Friction";
}

function likelyCause(label: string) {
  if (label === "Early Abandon") return "Early value communication or acquisition mismatch";
  if (label === "Backtrack Loop") return "Question confusion or answer uncertainty";
  if (label === "Slow-Step Stall") return "High cognitive load or technical hesitation";
  if (label === "Late-Stage Friction") return "Sensitive late questions or commitment friction";
  return "Healthy completion pattern";
}

export async function buildReplayPathClustersSnapshot(
  inputDays: number
): Promise<ReplayPathClustersSnapshot> {
  const days = clampDays(inputDays || 30, 7, 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const res = await supabaseFetch(
    `/rest/v1/survey_behavior_event?select=session_id,question_index,time_spent_ms,direction,event_time&event_time=gte.${since}&order=event_time.asc`,
    { headers: { Range: "0-49999" } }
  );

  if (!res.ok) {
    logger.error({ status: res.status }, "Replay path cluster query failed");
    throw new Error("Unable to load replay path clusters.");
  }

  const events = (await res.json()) as BehaviorEvent[];
  const sessionMap = new Map<string, BehaviorEvent[]>();

  for (const event of events) {
    const current = sessionMap.get(event.session_id) ?? [];
    current.push(event);
    sessionMap.set(event.session_id, current);
  }

  const clusters = new Map<
    string,
    {
      label: string;
      likelyCause: string;
      sessions: number;
      abandoned: number;
      avgDurationMs: number;
      maxQuestionReached: number;
      sampleSessionId: string | null;
    }
  >();

  for (const sessionEvents of sessionMap.values()) {
    const totalTimeMs = sessionEvents.reduce((sum, event) => sum + (event.time_spent_ms ?? 0), 0);
    const maxQuestionReached = Math.max(...sessionEvents.map((event) => event.question_index));
    const completed = sessionEvents.some((event) => event.direction === "complete");
    const abandoned = sessionEvents.some((event) => event.direction === "abandon");
    const backtracks = sessionEvents.filter((event) => event.direction === "back").length;
    const label = clusterLabel({
      completed,
      abandoned,
      backtracks,
      totalTimeMs,
      maxQuestionReached,
    });

    const current = clusters.get(label) ?? {
      label,
      likelyCause: likelyCause(label),
      sessions: 0,
      abandoned: 0,
      avgDurationMs: 0,
      maxQuestionReached: 0,
      sampleSessionId: sessionEvents[0]?.session_id ?? null,
    };

    current.sessions += 1;
    if (abandoned) current.abandoned += 1;
    current.avgDurationMs += totalTimeMs;
    current.maxQuestionReached = Math.max(current.maxQuestionReached, maxQuestionReached);
    if (!current.sampleSessionId && sessionEvents[0]?.session_id) {
      current.sampleSessionId = sessionEvents[0].session_id;
    }
    clusters.set(label, current);
  }

  return {
    generatedAt: new Date().toISOString(),
    days,
    totalSessions: sessionMap.size,
    clusters: [...clusters.values()]
      .map((cluster) => ({
        ...cluster,
        avgDurationMs:
          cluster.sessions > 0 ? Math.round(cluster.avgDurationMs / cluster.sessions) : 0,
        abandonmentRate:
          cluster.sessions > 0 ? Math.round((cluster.abandoned / cluster.sessions) * 100) : 0,
      }))
      .sort((left, right) => right.sessions - left.sessions),
  };
}
