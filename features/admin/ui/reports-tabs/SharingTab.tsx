"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import StatCard from "@features/admin/ui/StatCard";

interface ReportsData {
  sharing: {
    emailsSent: number;
    tokensCreated: number;
    tokensUsed: number;
  };
}

export default function SharingTab({ days }: { days: number }) {
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

  const { sharing } = data;
  const usageRate =
    sharing.tokensCreated > 0 ? Math.round((sharing.tokensUsed / sharing.tokensCreated) * 100) : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Emails Sent" value={sharing.emailsSent} />
      <StatCard label="Access Tokens Created" value={sharing.tokensCreated} />
      <StatCard label="Tokens Used" value={sharing.tokensUsed} />
      <StatCard label="Token Usage Rate" value={`${usageRate}%`} />
    </div>
  );
}
