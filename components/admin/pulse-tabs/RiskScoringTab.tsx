"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import RiskSessionCard from "./RiskSessionCard";

interface AtRiskSession {
  session_id: string;
  current_index: number;
  started_at: string;
  saved_at: string;
  answers_count: number;
  minutes_since_save: number;
  total_minutes: number;
  backtrack_count: number;
  total_events: number;
  risk_level: string;
}

const RISK_PRIORITY: Record<string, number> = {
  stale: 0,
  struggling: 1,
  high_backtrack: 2,
  normal: 3,
};

export default function RiskScoringTab() {
  const { data, loading, error, refetch } = useAdminFetch<AtRiskSession[]>(
    "/api/admin/pulse/at-risk"
  );

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort(
      (a, b) => (RISK_PRIORITY[a.risk_level] ?? 99) - (RISK_PRIORITY[b.risk_level] ?? 99)
    );
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, stale: 0, struggling: 0, highBacktrack: 0 };
    return {
      total: data.length,
      stale: data.filter((s) => s.risk_level === "stale").length,
      struggling: data.filter((s) => s.risk_level === "struggling").length,
      highBacktrack: data.filter((s) => s.risk_level === "high_backtrack").length,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-primary">At-Risk Sessions</h2>
        <button
          onClick={refetch}
          className="rounded-lg border border-white/10 bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-surface p-3 text-center">
          <div className="text-2xl font-semibold text-text-primary">{stats.total}</div>
          <div className="text-xs text-text-muted">Total At-Risk</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface p-3 text-center">
          <div className="text-2xl font-semibold text-red-400">{stats.stale}</div>
          <div className="text-xs text-text-muted">Stale</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface p-3 text-center">
          <div className="text-2xl font-semibold text-amber-400">{stats.struggling}</div>
          <div className="text-xs text-text-muted">Struggling</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface p-3 text-center">
          <div className="text-2xl font-semibold text-yellow-400">{stats.highBacktrack}</div>
          <div className="text-xs text-text-muted">High Backtrack</div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {/* Empty state */}
      {!loading && sorted.length === 0 && !error && (
        <div className="rounded-xl border border-white/10 bg-surface p-8 text-center text-sm text-text-muted">
          No at-risk sessions found
        </div>
      )}

      {/* Session list */}
      <div className="space-y-2">
        {sorted.map((session) => (
          <RiskSessionCard key={session.session_id} session={session} />
        ))}
      </div>
    </div>
  );
}
