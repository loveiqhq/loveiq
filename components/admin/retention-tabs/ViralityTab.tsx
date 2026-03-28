"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";

interface RetentionData {
  viralCoefficient: number;
  uniqueReferrers: number;
  funnel: Array<{ stage: string; count: number }>;
}

export default function ViralityTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<RetentionData>("/api/admin/retention", params);

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

  const invitesSent = data.funnel.find((f) => f.stage === "Invites Sent")?.count || 0;
  const completed = data.funnel.find((f) => f.stage === "Completed Survey")?.count || 0;
  const inviteRate = completed > 0 ? Math.round((invitesSent / completed) * 100) : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Viral Coefficient"
        value={data.viralCoefficient}
        sub="Invites per completer"
      />
      <StatCard label="Unique Referrers" value={data.uniqueReferrers} />
      <StatCard label="Invites Sent" value={invitesSent} />
      <StatCard label="Invite Rate" value={`${inviteRate}%`} sub="Of completers who invited" />
    </div>
  );
}
