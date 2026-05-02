"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import BarChart from "@/components/admin/BarChart";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface FailureCode {
  code: string;
  message: string;
  count: number;
}

interface RevenueData {
  failureCodes: FailureCode[];
  cardBrands: Array<{ brand: string; count: number }>;
  refundTotal: number;
  refundRate: number;
}

const failureColumns: Column<FailureCode>[] = [
  { key: "code", label: "Failure Code" },
  { key: "message", label: "Message", sortable: false },
  { key: "count", label: "Count", align: "right" },
];

export default function FailureAnalysisTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<RevenueData>("/api/admin/revenue", params);

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

  const brandItems = data.cardBrands.map((b) => ({ label: b.brand, value: b.count }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total Refunded" value={`$${data.refundTotal.toLocaleString()}`} />
        <StatCard label="Refund Rate" value={`${data.refundRate}%`} />
      </div>

      {data.failureCodes.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Top Failure Codes</h3>
          <KpiDataTable
            data={data.failureCodes}
            columns={failureColumns}
            defaultSortKey="count"
            defaultSortDir="desc"
          />
        </div>
      )}

      {brandItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Card Brand Distribution</h3>
          <BarChart items={brandItems} direction="horizontal" />
        </div>
      )}
    </div>
  );
}
