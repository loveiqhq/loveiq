"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import BarChart from "@/components/admin/BarChart";

interface RevenueData {
  totalRevenue: number;
  todayRevenue: number;
  transactionCount: number;
  avgPerUser: number;
  successRate: number;
  dailyRevenue: Array<{ date: string; amount: number; count: number }>;
  sectionRevenue: Array<{ name: string; revenue: number; count: number }>;
}

export default function RevenueOverviewTab({ days }: { days: number }) {
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
        {error || "Failed to load revenue data."}
      </div>
    );
  }

  const dailyItems = data.dailyRevenue.map((d) => ({
    label: d.date.slice(5),
    value: d.amount,
  }));

  const sectionItems = data.sectionRevenue.map((s) => ({
    label: s.name,
    value: s.revenue,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Revenue" value={`$${data.totalRevenue.toLocaleString()}`} />
        <StatCard label="Today" value={`$${data.todayRevenue.toLocaleString()}`} />
        <StatCard label="Transactions" value={data.transactionCount} />
        <StatCard label="Avg / User" value={`$${data.avgPerUser}`} />
        <StatCard label="Success Rate" value={`${data.successRate}%`} />
      </div>

      {dailyItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Daily Revenue ($)</h3>
          <BarChart items={dailyItems} direction="vertical" />
        </div>
      )}

      {sectionItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Revenue by Section</h3>
          <BarChart items={sectionItems} direction="horizontal" />
        </div>
      )}
    </div>
  );
}
