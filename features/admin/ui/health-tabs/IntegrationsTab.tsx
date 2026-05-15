"use client";

import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface IntegrationItem {
  name: string;
  status: "healthy" | "degraded" | "down";
  detail: string;
}

interface HealthData {
  integrations: IntegrationItem[];
  guardrails: Array<{
    label: string;
    current: number;
    target: number;
    status: "healthy" | "degraded" | "down";
    detail: string;
    href: string;
  }>;
}

export default function IntegrationsTab() {
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
        {error || "Failed to load integrations."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-2">
        {data.integrations.map((integration) => (
          <div key={integration.name} className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  integration.status === "healthy"
                    ? "bg-emerald-500"
                    : integration.status === "degraded"
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
              />
              <h3 className="text-sm font-medium text-text-primary">{integration.name}</h3>
            </div>
            <p className="mt-2 text-sm text-text-muted">{integration.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Conversion Guardrails</h3>
        <div className="space-y-3">
          {data.guardrails.map((guardrail) => (
            <a
              key={guardrail.label}
              href={guardrail.href}
              className="block rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{guardrail.label}</p>
                  <p className="mt-1 text-xs text-text-muted">{guardrail.detail}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
                    guardrail.status === "healthy"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : guardrail.status === "degraded"
                        ? "bg-amber-500/10 text-amber-200"
                        : "bg-red-500/10 text-red-300"
                  }`}
                >
                  {guardrail.current}/{guardrail.target}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
