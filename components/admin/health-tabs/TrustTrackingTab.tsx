"use client";

import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";

interface HealthData {
  trackingCoverage: Array<{
    event: string;
    expected: number;
    actual: number;
    status: "healthy" | "degraded" | "down";
    detail: string;
  }>;
  trustLayers: Array<{
    source: string;
    mode: string;
    sampleSize: number;
    lastUpdated: string | null;
    freshnessHours: number | null;
    warning: string | null;
  }>;
}

export default function TrustTrackingTab() {
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
        {error || "Failed to load trust and tracking data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Tracking Coverage Audit</h3>
        <div className="space-y-3">
          {data.trackingCoverage.map((item) => (
            <div key={item.event} className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text-primary">{item.event}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
                    item.status === "healthy"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : item.status === "degraded"
                        ? "bg-amber-500/10 text-amber-200"
                        : "bg-red-500/10 text-red-300"
                  }`}
                >
                  {item.actual}/{item.expected}
                </span>
              </div>
              <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {data.trustLayers.map((layer) => (
          <div key={layer.source} className="rounded-xl border border-white/10 bg-surface p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {layer.source}
            </p>
            <p className="mt-2 text-sm font-semibold text-text-primary">{layer.mode}</p>
            <p className="mt-1 text-xs text-text-muted">{layer.sampleSize} rows</p>
            <p className="mt-1 text-xs text-text-muted">
              {layer.freshnessHours != null
                ? `${layer.freshnessHours}h old`
                : "No freshness signal"}
            </p>
            {layer.warning && <p className="mt-3 text-sm text-amber-100/90">{layer.warning}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
