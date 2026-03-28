"use client";

import { useState, useMemo } from "react";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import SankeyDiagram from "@/components/admin/journey/SankeyDiagram";

interface JourneyNode {
  id: string;
  label: string;
  count: number;
}

interface JourneyLink {
  source: string;
  target: string;
  value: number;
}

interface JourneyData {
  nodes: JourneyNode[];
  links: JourneyLink[];
  totalUsers: number;
  overallConversion: number;
}

export default function JourneyDashboard() {
  const [days, setDays] = useState(0);

  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);

  const { data, loading, error } = useAdminFetch<JourneyData>("/api/admin/journey", params);

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
        {error || "Failed to load journey data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={data.totalUsers} />
        <StatCard label="Stages" value={data.nodes.length} />
        <StatCard label="Overall Conversion" value={`${data.overallConversion}%`} />
        <StatCard
          label="Biggest Drop-off"
          value={
            data.links.length > 0
              ? data.links.reduce((min, l) => (l.value < min.value ? l : min)).target
              : "—"
          }
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">User Journey Flow</h3>
        <SankeyDiagram nodes={data.nodes} links={data.links} />
      </div>
    </div>
  );
}
