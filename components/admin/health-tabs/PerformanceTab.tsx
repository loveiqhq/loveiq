"use client";

import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";

interface HealthData {
  services: Array<{
    name: string;
    status: string;
    latencyMs: number | null;
    detail: string;
  }>;
}

export default function PerformanceTab() {
  const { data, loading, error } = useAdminFetch<HealthData>("/api/admin/health/status");

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

  const supabase = data.services.find((s) => s.name === "Supabase");
  const scoring = data.services.find((s) => s.name === "Scoring Engine");
  const pipeline = data.services.find((s) => s.name === "Survey Pipeline");
  const email = data.services.find((s) => s.name === "Resend (Email)");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Supabase Latency"
        value={supabase?.latencyMs != null ? `${supabase.latencyMs}ms` : "—"}
        sub={supabase?.status || "unknown"}
      />
      <StatCard
        label="Scoring Success"
        value={scoring?.detail || "—"}
        sub={scoring?.status || "unknown"}
      />
      <StatCard
        label="Pipeline Freshness"
        value={pipeline?.detail || "—"}
        sub={pipeline?.status || "unknown"}
      />
      <StatCard
        label="Email Service"
        value={email?.status === "healthy" ? "Active" : "Issue"}
        sub={email?.detail || "unknown"}
      />
    </div>
  );
}
