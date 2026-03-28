"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import BarChart from "@/components/admin/BarChart";
import FunnelChart from "@/components/admin/funnel-tabs/FunnelChart";

interface TimeBucket {
  bucket: string;
  count: number;
}

interface ArchetypeConversion {
  archetype: string;
  count: number;
}

interface WaitlistConversionData {
  totalWaitlist: number;
  converted: number;
  conversionPct: number;
  avgHoursToConvert: number | null;
  funnel: {
    waitlist_total: number;
    mapped_to_user: number;
    completed: number;
    scored: number;
  };
  timeToConvert: TimeBucket[];
  conversionByArchetype: ArchetypeConversion[];
}

interface WaitlistConversionTabProps {
  days: number;
}

export default function WaitlistConversionTab({ days }: WaitlistConversionTabProps) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<WaitlistConversionData>(
    "/api/admin/growth/waitlist-conversion",
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
        {error || "Failed to load waitlist conversion data."}
      </div>
    );
  }

  const funnelStages = [
    { name: "Waitlist Total", count: data.funnel.waitlist_total },
    { name: "Mapped to User", count: data.funnel.mapped_to_user },
    { name: "Completed", count: data.funnel.completed },
    { name: "Scored", count: data.funnel.scored },
  ];

  const timeItems = data.timeToConvert.map((t) => ({ label: t.bucket, value: t.count }));
  const archetypeItems = data.conversionByArchetype.map((a) => ({
    label: a.archetype,
    value: a.count,
  }));

  const avgHoursDisplay =
    data.avgHoursToConvert != null ? `${data.avgHoursToConvert.toFixed(1)}h` : "\u2014";

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Waitlist" value={data.totalWaitlist.toLocaleString()} />
        <StatCard label="Converted (Completed)" value={data.converted.toLocaleString()} />
        <StatCard label="Overall Conversion" value={`${data.conversionPct.toFixed(1)}%`} />
        <StatCard
          label="Avg Hours to Convert"
          value={avgHoursDisplay}
          sub="waitlist to completion"
        />
      </div>

      {/* Funnel visualization */}
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Conversion Funnel</h3>
        <FunnelChart stages={funnelStages} />
      </div>

      {/* Time-to-Convert Distribution */}
      {timeItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">
            Time-to-Convert Distribution
          </h3>
          <BarChart items={timeItems} direction="horizontal" />
        </div>
      )}

      {/* Conversion by Archetype */}
      {archetypeItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Conversion by Archetype</h3>
          <BarChart items={archetypeItems} direction="horizontal" />
        </div>
      )}
    </div>
  );
}
