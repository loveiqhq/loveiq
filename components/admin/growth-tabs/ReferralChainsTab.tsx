"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import BarChart from "@/components/admin/BarChart";
import KpiDataTable from "@/components/admin/kpi-tabs/KpiDataTable";
import type { Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface MethodCount {
  method: string;
  count: number;
}

interface Referrer {
  email: string;
  invite_count: number;
  completions: number;
  conversion_rate: number;
}

interface ReferralData {
  totalInvites: number;
  uniqueReferrers: number;
  completionsFromInvites: number;
  viralCoefficient: number;
  methods: MethodCount[];
  topReferrers: Referrer[];
}

interface ReferralChainsTabProps {
  days: number;
}

const referrerColumns: Column<Referrer>[] = [
  { key: "email", label: "Email", sortable: false },
  { key: "invite_count", label: "Invites Sent", align: "right" },
  { key: "completions", label: "Completions", align: "right" },
  {
    key: "conversion_rate",
    label: "Conversion %",
    align: "right",
    format: (v) => (v != null ? `${Number(v).toFixed(1)}%` : "\u2014"),
  },
];

export default function ReferralChainsTab({ days }: ReferralChainsTabProps) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ReferralData>(
    "/api/admin/growth/referrals",
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
        {error || "Failed to load referral data."}
      </div>
    );
  }

  const methodItems = data.methods.map((m) => ({ label: m.method, value: m.count }));

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Invites" value={data.totalInvites.toLocaleString()} />
        <StatCard label="Unique Referrers" value={data.uniqueReferrers.toLocaleString()} />
        <StatCard
          label="Completions from Invites"
          value={data.completionsFromInvites.toLocaleString()}
        />
        <StatCard
          label="Viral Coefficient"
          value={data.viralCoefficient.toFixed(2)}
          sub="invites per user"
        />
      </div>

      {/* Invite methods bar chart */}
      {methodItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Invite Methods</h3>
          <BarChart items={methodItems} direction="horizontal" />
        </div>
      )}

      {/* Top referrers table */}
      {data.topReferrers.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Top Referrers</h3>
          <KpiDataTable
            data={data.topReferrers}
            columns={referrerColumns}
            defaultSortKey="invite_count"
            defaultSortDir="desc"
          />
        </div>
      )}
    </div>
  );
}
