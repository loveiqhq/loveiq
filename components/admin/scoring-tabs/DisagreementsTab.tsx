"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface Disagreement {
  id: number;
  submissionId: number;
  email: string;
  v4Archetype: string;
  v5Archetype: string;
  v4TopPct: number | null;
  v5TopPct: number | null;
}

interface ScoringData {
  disagreements: Disagreement[];
}

const columns: Column<Disagreement>[] = [
  {
    key: "submissionId",
    label: "Submission",
    sortable: false,
    format: (v) => `#${v}`,
  },
  { key: "email", label: "Email", sortable: false },
  { key: "v4Archetype", label: "V4 Archetype" },
  { key: "v5Archetype", label: "V5 Archetype" },
  {
    key: "v4TopPct",
    label: "V4 %",
    align: "right",
    format: (v) => (v != null ? `${v}%` : "—"),
  },
  {
    key: "v5TopPct",
    label: "V5 %",
    align: "right",
    format: (v) => (v != null ? `${v}%` : "—"),
  },
];

export default function DisagreementsTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ScoringData>(
    "/api/admin/scoring/comparison",
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

  if (data.disagreements.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-8 text-center text-sm text-text-muted">
        No disagreements found — V4 and V5 agree on all submissions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        {data.disagreements.length} submissions where V4 and V5 assigned different primary
        archetypes.
      </p>
      <KpiDataTable
        data={data.disagreements}
        columns={columns}
        defaultSortKey="v4TopPct"
        defaultSortDir="desc"
      />
    </div>
  );
}
