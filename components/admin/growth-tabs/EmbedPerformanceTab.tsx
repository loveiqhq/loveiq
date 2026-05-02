"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";

interface EmbedData {
  placements: Array<{
    placement: string;
    starts: number;
    completionRate: number;
    partialRate: number;
    recoveryRate: number;
    reportViewRate: number;
    paidRate: number;
  }>;
  summary: {
    trackedPlacements: number;
    embeddedStarts: number;
    hostedStarts: number;
  };
  trust: {
    warning: string | null;
  };
}

export default function EmbedPerformanceTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<EmbedData>(
    "/api/admin/growth/embed-performance",
    params
  );

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
        {error || "Failed to load embed performance."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Placements" value={data.summary.trackedPlacements} />
        <StatCard label="Embedded Starts" value={data.summary.embeddedStarts} />
        <StatCard label="Hosted Starts" value={data.summary.hostedStarts} />
      </div>

      {data.trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {data.trust.warning}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {data.placements.map((placement) => (
          <div
            key={placement.placement}
            className="rounded-xl border border-white/10 bg-surface p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-text-primary">{placement.placement}</h3>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-text-muted">
                {placement.starts} starts
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Complete</p>
                <p className="mt-1 text-sm text-text-primary">{placement.completionRate}%</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Recovery</p>
                <p className="mt-1 text-sm text-text-primary">{placement.recoveryRate}%</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Report View</p>
                <p className="mt-1 text-sm text-text-primary">{placement.reportViewRate}%</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Partial rate {placement.partialRate}% · paid rate {placement.paidRate}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
