"use client";

import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface ServiceStatus {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  lastCheck: string;
  detail: string;
}

interface HealthData {
  overallStatus: string;
  services: ServiceStatus[];
  checkedAt: string;
}

const statusColors = {
  healthy: "bg-emerald-500",
  degraded: "bg-yellow-500",
  down: "bg-red-500",
};

const statusLabels = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
};

export default function ServicesTab() {
  const { data, loading, error, refetch } = useAdminFetch<HealthData>("/api/admin/health/status");

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
        {error || "Failed to load health data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`h-3 w-3 rounded-full ${statusColors[data.overallStatus as keyof typeof statusColors] || statusColors.degraded}`}
          />
          <span className="text-sm font-medium text-text-primary">
            Overall:{" "}
            {statusLabels[data.overallStatus as keyof typeof statusLabels] || data.overallStatus}
          </span>
        </div>
        <button
          onClick={refetch}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-text-muted transition hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.services.map((svc) => (
          <div key={svc.name} className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${statusColors[svc.status]}`} />
              <h3 className="text-sm font-medium text-text-primary">{svc.name}</h3>
            </div>
            <p className="mt-2 text-xs text-text-muted">{svc.detail}</p>
            {svc.latencyMs != null && (
              <p className="mt-1 text-xs text-text-muted">{svc.latencyMs}ms latency</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-text-muted">
        Last checked: {new Date(data.checkedAt).toLocaleString()}
      </p>
    </div>
  );
}
