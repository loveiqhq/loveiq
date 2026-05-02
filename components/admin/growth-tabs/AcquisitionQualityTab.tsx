"use client";

import { useMemo } from "react";
import BarChart from "@/components/admin/BarChart";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface ChannelRow {
  source: string;
  signups: number;
  starts: number;
  startRate: number | null;
  completionRate: number;
  scoredRate: number;
  reportViewRate: number;
  paidRate: number;
  recoveryRate: number;
  flaggedRate: number;
  avgDurationMin: number | null;
  revenuePerStart: number;
  revenueTotal: number;
  efficiencyScore: number;
  confidence: "high" | "medium" | "low";
  action: "scale" | "watch" | "fix" | "blindspot";
}

interface AcquisitionQualityData {
  channels: ChannelRow[];
  summary: {
    totalSources: number;
    totalSignups: number;
    totalStarts: number;
    totalPartialSaves: number;
    avgEfficiencyScore: number;
    scaleCandidates: number;
    fixCandidates: number;
    bestSource: string | null;
    weakestHighVolumeSource: string | null;
  };
  trust: {
    windowDays: number;
    sampleSize: number;
    warning: string | null;
  };
}

const columns: Column<ChannelRow>[] = [
  { key: "source", label: "Source" },
  { key: "action", label: "Action" },
  { key: "confidence", label: "Confidence" },
  { key: "signups", label: "Signups", align: "right" },
  { key: "starts", label: "Starts", align: "right" },
  {
    key: "startRate",
    label: "Start",
    align: "right",
    format: (value) => (value == null ? "—" : `${value}%`),
  },
  {
    key: "completionRate",
    label: "Completion",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "reportViewRate",
    label: "Report",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "paidRate",
    label: "Paid",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "recoveryRate",
    label: "Recovery",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "flaggedRate",
    label: "Flagged",
    align: "right",
    format: (value) => `${value}%`,
  },
  {
    key: "revenuePerStart",
    label: "Rev / Start",
    align: "right",
    format: (value) => `$${value}`,
  },
  {
    key: "efficiencyScore",
    label: "Efficiency",
    align: "right",
    format: (value) => `${value}`,
  },
];

function recommendationTone(action: ChannelRow["action"]) {
  if (action === "scale") return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  if (action === "fix") return "border-red-500/20 bg-red-500/5 text-red-300";
  if (action === "blindspot") return "border-amber-500/20 bg-amber-500/5 text-amber-200";
  return "border-white/10 bg-white/5 text-text-primary";
}

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
        {error || "Failed to load channel efficiency data."}
      </div>
    );
  }

  const actionLeaders = data.channels.slice(0, 4);
  const barItems = data.channels.slice(0, 8).map((channel) => ({
    label: channel.source,
    value: channel.starts,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Channel Efficiency Board</h3>
          <p className="mt-1 text-sm text-text-muted">
            Rank sources by acquisition quality, recovery, monetization, and downstream efficiency.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Window: {data.trust.windowDays} days | Sample: {data.trust.sampleSize.toLocaleString()}{" "}
          starts
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tracked Sources" value={data.summary.totalSources} />
        <StatCard label="Waitlist Signups" value={data.summary.totalSignups.toLocaleString()} />
        <StatCard label="Survey Starts" value={data.summary.totalStarts.toLocaleString()} />
        <StatCard label="Avg Efficiency" value={data.summary.avgEfficiencyScore} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Partial Saves" value={data.summary.totalPartialSaves.toLocaleString()} />
        <StatCard label="Scale Candidates" value={data.summary.scaleCandidates} />
        <StatCard label="Fix Candidates" value={data.summary.fixCandidates} />
        <StatCard
          label="Best Source"
          value={data.summary.bestSource ?? "—"}
          sub={
            data.summary.weakestHighVolumeSource
              ? `Weak high-volume: ${data.summary.weakestHighVolumeSource}`
              : undefined
          }
        />
      </div>

      {data.trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {data.trust.warning}
        </div>
      )}

      {data.channels.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <p className="text-sm text-text-muted">No source data available in this window.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <h3 className="mb-4 text-sm font-medium text-text-primary">Starts by Source</h3>
              <BarChart items={barItems} direction="horizontal" />
            </div>

            <div className="rounded-xl border border-white/10 bg-surface p-5">
              <h3 className="mb-4 text-sm font-medium text-text-primary">Recommended Actions</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {actionLeaders.map((channel) => (
                  <div
                    key={channel.source}
                    className={`rounded-xl border p-4 ${recommendationTone(channel.action)}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{channel.source}</p>
                      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                        {channel.action}
                      </span>
                    </div>
                    <p className="mt-2 text-sm opacity-90">
                      {channel.starts.toLocaleString()} starts, {channel.completionRate}%
                      completion, {channel.paidRate}% paid, ${channel.revenuePerStart} revenue per
                      start.
                    </p>
                    <p className="mt-2 text-xs opacity-70">
                      Confidence: {channel.confidence} | Efficiency: {channel.efficiencyScore}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-medium text-text-primary">
              Channel Efficiency Leaderboard
            </h3>
            <KpiDataTable
              data={data.channels}
              columns={columns}
              defaultSortKey="efficiencyScore"
              defaultSortDir="desc"
            />
          </div>
        </>
      )}
    </div>
  );
}
