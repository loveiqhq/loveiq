"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";

interface SessionSummary {
  sessionId: string;
  eventCount: number;
  firstEvent: string;
  lastEvent: string;
  totalTimeMs: number;
  maxQuestionReached: number;
  completed: boolean;
  abandoned: boolean;
}

interface SessionEvent {
  qId: string;
  chapter: string;
  questionIndex: number;
  timeSpentMs: number | null;
  answered: boolean;
  direction: string;
  eventTime: string;
}

interface SessionListData {
  sessions: SessionSummary[];
  totalSessions: number;
}

interface SessionDetailData {
  sessionId: string;
  events: SessionEvent[];
}

const directionConfig: Record<string, { icon: string; color: string; label: string }> = {
  forward: { icon: "→", color: "text-blue-400", label: "Forward" },
  back: { icon: "←", color: "text-yellow-400", label: "Back" },
  abandon: { icon: "✗", color: "text-red-400", label: "Abandon" },
  complete: { icon: "✓", color: "text-green-400", label: "Complete" },
};

export default function ReplayDashboard() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const listParams = useMemo(() => undefined, []);
  const detailParams = useMemo(
    () => (selectedSession ? { sessionId: selectedSession } : undefined),
    [selectedSession]
  );

  const {
    data: listData,
    loading: listLoading,
    error: listError,
  } = useAdminFetch<SessionListData>("/api/admin/replay", listParams);

  const {
    data: detailData,
    loading: detailLoading,
    error: detailError,
  } = useAdminFetch<SessionDetailData>(selectedSession ? "/api/admin/replay" : "", detailParams);

  if (!selectedSession) {
    // Session list view
    if (listLoading) {
      return (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      );
    }
    if (listError || !listData) {
      return (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {listError || "Failed to load sessions."}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Total Sessions
            </p>
            <p className="mt-1 text-2xl font-bold text-text-primary">{listData.totalSessions}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Completed
            </p>
            <p className="mt-1 text-2xl font-bold text-green-400">
              {listData.sessions.filter((s) => s.completed).length}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Abandoned
            </p>
            <p className="mt-1 text-2xl font-bold text-red-400">
              {listData.sessions.filter((s) => s.abandoned).length}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-surface overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Events</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Max Q</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
              </tr>
            </thead>
            <tbody>
              {listData.sessions.map((s) => (
                <tr
                  key={s.sessionId}
                  onClick={() => setSelectedSession(s.sessionId)}
                  className="cursor-pointer border-b border-white/5 hover:bg-white/5"
                >
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {s.sessionId.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-3 text-text-muted">{s.eventCount}</td>
                  <td className="px-4 py-3 text-text-muted">{Math.round(s.totalTimeMs / 1000)}s</td>
                  <td className="px-4 py-3 text-text-muted">Q{s.maxQuestionReached}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.completed
                          ? "bg-green-500/20 text-green-400"
                          : s.abandoned
                            ? "bg-red-500/20 text-red-400"
                            : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {s.completed ? "Completed" : s.abandoned ? "Abandoned" : "In Progress"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {new Date(s.firstEvent).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Session detail view
  if (detailLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => setSelectedSession(null)}
        className="text-sm text-accent-purple hover:underline"
      >
        ← All Sessions
      </button>

      {detailError || !detailData ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {detailError || "Failed to load session."}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Session
              </p>
              <p className="mt-1 truncate font-mono text-sm text-text-primary">
                {detailData.sessionId.slice(0, 12)}...
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Events</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {detailData.events.length}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Max Question
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                Q{Math.max(...detailData.events.map((e) => e.questionIndex), 0)}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Total Time
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {Math.round(detailData.events.reduce((s, e) => s + (e.timeSpentMs || 0), 0) / 1000)}
                s
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-medium text-text-primary">Event Timeline</h3>
            <div className="space-y-0">
              {detailData.events.map((e, i) => {
                const cfg = directionConfig[e.direction] || {
                  icon: "·",
                  color: "text-text-muted",
                  label: e.direction,
                };
                const startTime = new Date(detailData.events[0].eventTime).getTime();
                const elapsed = new Date(e.eventTime).getTime() - startTime;
                const mins = Math.floor(elapsed / 60_000);
                const secs = Math.floor((elapsed % 60_000) / 1000);
                return (
                  <div
                    key={i}
                    className="flex items-start gap-4 border-l-2 border-white/10 pb-4 pl-4"
                  >
                    <div className="w-16 shrink-0 text-xs text-text-muted">
                      {mins}:{secs.toString().padStart(2, "0")}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-bold ${cfg.color}`}>{cfg.icon}</span>
                        <span className="text-sm font-medium text-text-primary">{e.qId}</span>
                        <span className="text-xs text-text-muted">{e.chapter}</span>
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        {e.timeSpentMs ? `${(e.timeSpentMs / 1000).toFixed(1)}s` : "—"} ·{" "}
                        {e.answered ? (
                          <span className="text-green-400">✓ Answered</span>
                        ) : (
                          <span className="text-text-muted">○ Skipped</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
