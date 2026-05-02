"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";

interface FunnelStage {
  stage: string;
  count: number;
}

interface RetentionData {
  funnel: FunnelStage[];
  returnVisitors: number;
}

export default function RetentionFunnelTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<RetentionData>("/api/admin/retention", params);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load data."}
      </div>
    );
  }

  const { funnel } = data;
  const maxCount = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Funnel Start" value={funnel[0]?.count || 0} sub={funnel[0]?.stage} />
        <StatCard label="Return Visitors" value={data.returnVisitors} sub="Users who came back" />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Retention Funnel</h3>
        <div className="space-y-3">
          {funnel.map((stage, idx) => {
            const pct = (stage.count / maxCount) * 100;
            const prevCount = idx > 0 ? funnel[idx - 1].count : stage.count;
            const convRate = prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : 100;
            return (
              <div key={stage.stage}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-text-muted">{stage.stage}</span>
                  <span className="text-text-primary">
                    {stage.count}
                    {idx > 0 && <span className="ml-2 text-text-muted">({convRate}%)</span>}
                  </span>
                </div>
                <div className="h-6 rounded-full bg-white/5">
                  <div
                    className="h-6 rounded-full bg-accent-purple transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
