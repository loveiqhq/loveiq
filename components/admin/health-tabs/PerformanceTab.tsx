"use client";

import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";

interface HealthSlo {
  key: string;
  label: string;
  owner: "tech" | "product" | "growth";
  status: "healthy" | "degraded" | "down";
  objective: string;
  current: string;
  errorBudgetRemaining: number;
  measurementWindow: string;
  detail: string;
  href: string;
}

interface PerformanceHotspot {
  title: string;
  category: "service" | "tracking" | "guardrail" | "trust" | "rate-limit" | "webhook";
  severity: "risk" | "watch";
  value: string;
  detail: string;
  href: string;
  owner: "tech" | "product" | "growth";
}

interface HealthData {
  slos: HealthSlo[];
  performanceHotspots: PerformanceHotspot[];
  checkedAt: string;
}

const STATUS_CLASSES: Record<HealthSlo["status"], string> = {
  healthy: "bg-emerald-500/10 text-emerald-300",
  degraded: "bg-amber-500/10 text-amber-200",
  down: "bg-red-500/10 text-red-300",
};

const HOTSPOT_CLASSES: Record<PerformanceHotspot["severity"], string> = {
  risk: "bg-red-500/10 text-red-300",
  watch: "bg-amber-500/10 text-amber-200",
};

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

  const healthy = data.slos.filter((item) => item.status === "healthy").length;
  const degraded = data.slos.filter((item) => item.status === "degraded").length;
  const down = data.slos.filter((item) => item.status === "down").length;
  const riskHotspots = data.performanceHotspots.filter((item) => item.severity === "risk").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Healthy SLOs"
          value={String(healthy)}
          sub={`${data.slos.length} tracked`}
        />
        <StatCard label="Degraded SLOs" value={String(degraded)} sub="Needs attention" />
        <StatCard label="Breached SLOs" value={String(down)} sub="Outside target window" />
        <StatCard label="Risk Hotspots" value={String(riskHotspots)} sub="Priority queue" />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary">SLA / SLO Board</h3>
            <p className="mt-1 text-xs text-text-muted">
              Reliability objectives for admin-critical infrastructure, tracking, and scoring flow.
            </p>
          </div>
          <p className="text-xs text-text-muted">
            Checked {new Date(data.checkedAt).toLocaleString()}
          </p>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.slos.map((slo) => (
            <a
              key={slo.key}
              href={slo.href}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary">{slo.label}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${STATUS_CLASSES[slo.status]}`}
                    >
                      {slo.status}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {slo.owner}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">{slo.detail}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-text-primary">{slo.current}</p>
                  <p className="text-xs text-text-muted">Objective {slo.objective}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <SloMeta label="Error Budget" value={`${slo.errorBudgetRemaining}%`} />
                <SloMeta label="Window" value={slo.measurementWindow} />
                <SloMeta label="Target" value={slo.objective} />
              </div>

              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${
                      slo.status === "healthy"
                        ? "bg-emerald-400"
                        : slo.status === "degraded"
                          ? "bg-amber-400"
                          : "bg-red-400"
                    }`}
                    style={{ width: `${Math.max(6, slo.errorBudgetRemaining)}%` }}
                  />
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary">Performance Hotspots</h3>
            <p className="mt-1 text-xs text-text-muted">
              Derived from degraded services, trust gaps, tracking misses, guardrails, and recent
              operational failures.
            </p>
          </div>
          <span className="text-xs text-text-muted">
            {data.performanceHotspots.length} surfaced
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {data.performanceHotspots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
              No operational hotspots are active right now.
            </div>
          ) : (
            data.performanceHotspots.map((hotspot) => (
              <a
                key={`${hotspot.category}-${hotspot.title}`}
                href={hotspot.href}
                className="block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">{hotspot.title}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${HOTSPOT_CLASSES[hotspot.severity]}`}
                      >
                        {hotspot.severity}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {hotspot.category}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        owner {hotspot.owner}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-text-muted">{hotspot.detail}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-3 text-right">
                    <p className="text-[11px] uppercase tracking-wide text-text-muted">Signal</p>
                    <p className="mt-1 text-sm font-medium text-text-primary">{hotspot.value}</p>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SloMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}
