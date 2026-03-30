"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface AttributionData {
  channels: Array<{
    source: string;
    starts: number;
    completionRate: number;
    reportViewRate: number;
    paidRate: number;
    revenueTotal: number;
  }>;
  archetypes: Array<{
    archetype: string;
    starts: number;
    reportViewRate: number;
    paidRate: number;
    revenueTotal: number;
  }>;
  trust: {
    warning: string | null;
  };
}

const channelColumns: Column<AttributionData["channels"][number]>[] = [
  { key: "source", label: "Channel" },
  { key: "starts", label: "Starts", align: "right" },
  { key: "completionRate", label: "Completion", align: "right", format: (value) => `${value}%` },
  { key: "reportViewRate", label: "Report View", align: "right", format: (value) => `${value}%` },
  { key: "paidRate", label: "Paid", align: "right", format: (value) => `${value}%` },
  { key: "revenueTotal", label: "Revenue", align: "right", format: (value) => `$${value}` },
];

const archetypeColumns: Column<AttributionData["archetypes"][number]>[] = [
  { key: "archetype", label: "Archetype" },
  { key: "starts", label: "Starts", align: "right" },
  { key: "reportViewRate", label: "Report View", align: "right", format: (value) => `${value}%` },
  { key: "paidRate", label: "Paid", align: "right", format: (value) => `${value}%` },
  { key: "revenueTotal", label: "Revenue", align: "right", format: (value) => `$${value}` },
];

export default function ValueAttributionTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<AttributionData>(
    "/api/admin/growth/value-attribution",
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
        {error || "Failed to load value attribution."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {data.trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {data.trust.warning}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">
          Response-to-Revenue Attribution
        </h3>
        <KpiDataTable
          data={data.channels}
          columns={channelColumns}
          defaultSortKey="revenueTotal"
          defaultSortDir="desc"
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Value By Archetype</h3>
        <KpiDataTable
          data={data.archetypes}
          columns={archetypeColumns}
          defaultSortKey="revenueTotal"
          defaultSortDir="desc"
        />
      </div>
    </div>
  );
}
