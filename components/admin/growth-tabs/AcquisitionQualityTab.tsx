"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface ChannelRow {
  source: string;
  totalSubmissions: number;
  completionRate: number;
  scoredRate: number;
  flaggedRate: number;
  partialSaveCount: number;
  resumedCompleted: number;
  resumedRecoveryRate: number;
  avgDurationMin: number | null;
  qualityScore: number;
}

interface AcquisitionQualityData {
  channels: ChannelRow[];
  summary: {
    totalSources: number;
    totalSubmissions: number;
    totalPartialSaves: number;
    bestSource: string | null;
    worstSource: string | null;
  };
  trust: {
    windowDays: number;
    sampleSize: number;
    warning: string | null;
  };
}

const columns: Column<ChannelRow>[] = [
  { key: "source", label: "Source" },
  { key: "qualityScore", label: "Quality", align: "right", format: (v) => `${v}` },
  {
    key: "completionRate",
    label: "Completion",
    align: "right",
    format: (v) => `${v}%`,
  },
  {
    key: "scoredRate",
    label: "Scored",
    align: "right",
    format: (v) => `${v}%`,
  },
  {
    key: "resumedRecoveryRate",
    label: "Recovery",
    align: "right",
    format: (v) => `${v}%`,
  },
  {
    key: "flaggedRate",
    label: "Flagged",
    align: "right",
    format: (v) => `${v}%`,
  },
  {
    key: "totalSubmissions",
    label: "Subs",
    align: "right",
  },
];

export default function AcquisitionQualityTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<AcquisitionQualityData>(
    "/api/admin/growth/acquisition-quality",
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
        {error || "Failed to load acquisition quality data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tracked Sources" value={data.summary.totalSources} />
        <StatCard label="Submissions" value={data.summary.totalSubmissions} />
        <StatCard label="Partial Saves" value={data.summary.totalPartialSaves} />
        <StatCard
          label="Best Source"
          value={data.summary.bestSource ?? "—"}
          sub={data.summary.worstSource ? `Worst: ${data.summary.worstSource}` : undefined}
        />
      </div>

      {data.trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {data.trust.warning}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Acquisition Quality Score</h3>
        {data.channels.length === 0 ? (
          <p className="text-sm text-text-muted">No source data available in this window.</p>
        ) : (
          <KpiDataTable
            data={data.channels}
            columns={columns}
            defaultSortKey="qualityScore"
            defaultSortDir="desc"
          />
        )}
      </div>
    </div>
  );
}
