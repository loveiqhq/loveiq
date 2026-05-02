"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import BarChart from "@/components/admin/BarChart";

interface ScoringData {
  totalScored: number;
  agreementRate: number;
  v4Only: number;
  v5Only: number;
  v4Distribution: Array<{ archetype: string; count: number }>;
  v5Distribution: Array<{ archetype: string; count: number }>;
  driftMatrix: Array<{ v4: string; v5: string; count: number }>;
  disagreements: Array<{
    id: number;
    submissionId: number;
    email: string;
    v4Archetype: string;
    v5Archetype: string;
    v4TopPct: number | null;
    v5TopPct: number | null;
  }>;
}

export default function AgreementTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ScoringData>(
    "/api/admin/scoring/comparison",
    params
  );

  // Per-archetype agreement rates (must be before early returns for hook rules)
  const archetypeAgreement = useMemo(() => {
    if (!data) return [];
    const archetypes = new Set<string>();
    for (const d of data.driftMatrix) archetypes.add(d.v4);
    return Array.from(archetypes)
      .map((arch) => {
        const total = data.driftMatrix
          .filter((d) => d.v4 === arch)
          .reduce((s, d) => s + d.count, 0);
        const agreed = data.driftMatrix.find((d) => d.v4 === arch && d.v5 === arch)?.count ?? 0;
        return { label: arch, value: total > 0 ? Math.round((agreed / total) * 100) : 0 };
      })
      .sort((a, b) => b.value - a.value);
  }, [data]);

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
        {error || "Failed to load scoring data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Scored (V4+V5)" value={data.totalScored} />
        <StatCard label="Agreement Rate" value={`${data.agreementRate}%`} />
        <StatCard label="V4-Only" value={data.v4Only} />
        <StatCard label="V5-Only" value={data.v5Only} />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">
          Per-Archetype Agreement Rate (%)
        </h3>
        <BarChart items={archetypeAgreement} direction="horizontal" />
      </div>
    </div>
  );
}
