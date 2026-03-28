"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface AdminEntry {
  email: string;
  actionCount: number;
  topAction: string;
  lastActive: string;
}

interface ActivityData {
  perAdmin: AdminEntry[];
}

const columns: Column<AdminEntry>[] = [
  { key: "email", label: "Admin", sortable: false },
  { key: "actionCount", label: "Actions", align: "right" },
  { key: "topAction", label: "Most Common", sortable: false },
  {
    key: "lastActive",
    label: "Last Active",
    format: (v) => (v ? new Date(String(v)).toLocaleDateString() : "—"),
  },
];

export default function PerAdminTab({ days }: { days: number }) {
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
        {error || "Failed to load data."}
      </div>
    );
  }

  return (
    <KpiDataTable
      data={data.perAdmin}
      columns={columns}
      defaultSortKey="actionCount"
      defaultSortDir="desc"
    />
  );
}
