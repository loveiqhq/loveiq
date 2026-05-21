"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@features/admin/ui/kpi-tabs/KpiDataTable";

interface ActivityEntry {
  id: number;
  adminEmail: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  severity: "high" | "medium" | "low";
  createdAt: string;
  metadataSummary: string;
}

interface ResourceHotspot {
  resourceType: string;
  count: number;
  lastTouched: string;
  highSeverityCount: number;
}

interface ActivityData {
  entries: ActivityEntry[];
  resourceHotspots: ResourceHotspot[];
}

const hotspotColumns: Column<ResourceHotspot>[] = [
  { key: "resourceType", label: "Resource" },
  { key: "count", label: "Touches", align: "right" },
  { key: "highSeverityCount", label: "High Severity", align: "right" },
  {
    key: "lastTouched",
    label: "Last Touched",
    format: (value) => new Date(String(value)).toLocaleString(),
  },
];

export default function OrgLogTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ActivityData>("/api/admin/activity", params);

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
        {error || "Failed to load org activity log."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Resource Hotspots</h3>
        <KpiDataTable
          data={data.resourceHotspots}
          columns={hotspotColumns}
          defaultSortKey="highSeverityCount"
          defaultSortDir="desc"
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Resource</th>
              <th className="px-4 py-3">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry) => (
              <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 text-xs text-text-muted">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
                      entry.severity === "high"
                        ? "bg-red-500/20 text-red-300"
                        : entry.severity === "medium"
                          ? "bg-amber-500/20 text-amber-200"
                          : "bg-white/10 text-text-muted"
                    }`}
                  >
                    {entry.severity}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-primary">{entry.adminEmail}</td>
                <td className="px-4 py-3 text-text-muted">{entry.action}</td>
                <td className="px-4 py-3 text-text-muted">
                  {entry.resourceType}
                  {entry.resourceId ? ` #${entry.resourceId}` : ""}
                </td>
                <td className="max-w-md truncate px-4 py-3 text-xs text-text-muted">
                  {entry.metadataSummary}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
