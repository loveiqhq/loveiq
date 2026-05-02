"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface RetentionData {
  entryPaths: Array<{
    path: string;
    total: number;
    viewed: number;
    paid: number;
    viewRate: number;
    paidRate: number;
  }>;
}

const columns: Column<RetentionData["entryPaths"][number]>[] = [
  { key: "path", label: "Entry Path" },
  { key: "total", label: "Completed", align: "right" },
  { key: "viewRate", label: "Report View", align: "right", format: (value) => `${value}%` },
  { key: "paidRate", label: "Paid", align: "right", format: (value) => `${value}%` },
];

export default function EntryPathsTab({ days }: { days: number }) {
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
        {error || "Failed to load entry paths."}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 text-sm font-medium text-text-primary">Cohort Retention By Entry Path</h3>
      <KpiDataTable
        data={data.entryPaths}
        columns={columns}
        defaultSortKey="viewRate"
        defaultSortDir="desc"
      />
    </div>
  );
}
