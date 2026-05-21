"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import StatCard from "@features/admin/ui/StatCard";

interface ActivityData {
  unreviewedCount: number;
}

export default function BacklogTab({ days }: { days: number }) {
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
    <div className="space-y-6">
      <StatCard
        label="Unreviewed Submissions"
        value={data.unreviewedCount}
        sub="Submissions with no admin actions"
      />
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <p className="text-sm text-text-muted">
          There are <strong className="text-text-primary">{data.unreviewedCount}</strong> completed
          submissions that have not been viewed, flagged, or noted by any admin. Visit the{" "}
          <Link href="/admin/submissions" className="text-accent-purple hover:underline">
            Submissions
          </Link>{" "}
          page to review them.
        </p>
      </div>
    </div>
  );
}
