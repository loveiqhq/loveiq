"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface AmbiguousCase {
  id: number;
  submissionId: number;
  email: string;
  v4Archetype: string;
  v5Archetype: string;
  v4TopPct: number | null;
  v5TopPct: number | null;
  v4Gap: number | null;
  v5Gap: number | null;
  agreement: boolean;
  confidence: "high" | "medium" | "low";
  ambiguityScore: number;
}

interface ScoringData {
  totalScored: number;
  confidenceSummary: {
    high: number;
    medium: number;
    low: number;
    ambiguous: number;
  };
  ambiguousCases: AmbiguousCase[];
}

const columns: Column<AmbiguousCase>[] = [
  {
    key: "submissionId",
    label: "Submission",
    format: (value) => `#${value}`,
  },
  { key: "email", label: "Email", sortable: false },
  { key: "v4Archetype", label: "V4" },
  { key: "v5Archetype", label: "V5" },
  { key: "confidence", label: "Confidence" },
  {
    key: "v4Gap",
    label: "V4 Gap",
    align: "right",
    format: (value) => (value != null ? `${value}` : "—"),
  },
  {
    key: "v5Gap",
    label: "V5 Gap",
    align: "right",
    format: (value) => (value != null ? `${value}` : "—"),
  },
  {
    key: "ambiguityScore",
    label: "Ambiguity",
    align: "right",
  },
];

export default function ConfidenceTab({ days }: { days: number }) {
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
        {error || "Failed to load confidence data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Dual-Scored" value={data.totalScored} />
        <StatCard label="High Confidence" value={data.confidenceSummary.high} />
        <StatCard label="Medium Confidence" value={data.confidenceSummary.medium} />
        <StatCard label="Low Confidence" value={data.confidenceSummary.low} />
        <StatCard label="Ambiguous Cases" value={data.confidenceSummary.ambiguous} />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Ambiguity Queue</h3>
        {data.ambiguousCases.length === 0 ? (
          <p className="text-sm text-text-muted">No ambiguous scoring cases found.</p>
        ) : (
          <KpiDataTable
            data={data.ambiguousCases}
            columns={columns}
            defaultSortKey="ambiguityScore"
            defaultSortDir="desc"
          />
        )}
      </div>
    </div>
  );
}
