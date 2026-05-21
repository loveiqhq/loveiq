"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@features/admin/ui/kpi-tabs/KpiDataTable";

interface SectionRating {
  sectionId: number;
  sectionName: string;
  avgRating: number;
  ratingCount: number;
  topComments: string[];
}

interface ReportsData {
  sectionRatings: SectionRating[];
}

const columns: Column<SectionRating>[] = [
  { key: "sectionName", label: "Section", sortable: false },
  {
    key: "avgRating",
    label: "Avg Rating",
    align: "right",
    format: (v) => (Number(v) > 0 ? `${Number(v).toFixed(1)} ★` : "—"),
  },
  { key: "ratingCount", label: "Ratings", align: "right" },
  {
    key: "topComments",
    label: "Top Comment",
    sortable: false,
    format: (v) => {
      const comments = v as unknown as string[];
      return comments.length > 0 ? comments[0]!.slice(0, 80) : "—";
    },
  },
];

export default function SectionRatingsTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ReportsData>(
    "/api/admin/reports/engagement",
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
        {error || "Failed to load data."}
      </div>
    );
  }

  if (data.sectionRatings.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-8 text-center text-sm text-text-muted">
        No section ratings yet.
      </div>
    );
  }

  return (
    <KpiDataTable
      data={data.sectionRatings}
      columns={columns}
      defaultSortKey="ratingCount"
      defaultSortDir="desc"
    />
  );
}
