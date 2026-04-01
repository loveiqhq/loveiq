"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import type { AdminSimulationSnapshot, AdminSimulationSurface } from "@/lib/admin/simulation-types";

function toneClasses(tone: "good" | "watch" | "risk"): string {
  if (tone === "good") return "border-emerald-500/20 bg-emerald-500/5";
  if (tone === "risk") return "border-red-500/20 bg-red-500/5";
  return "border-amber-500/20 bg-amber-500/5";
}

interface AdminSimulationPanelProps {
  surface: AdminSimulationSurface;
  days?: number;
  title?: string;
}

export default function AdminSimulationPanel({
  surface,
  days = 30,
  title,
}: AdminSimulationPanelProps) {
  const params = useMemo(() => ({ surface, days: String(days) }), [days, surface]);
  const { data, loading, error } = useAdminFetch<AdminSimulationSnapshot>(
    "/api/admin/simulations",
    params
  );

  if (loading) {
    return (
      <section className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-center py-8">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-300">
        {error || "Unable to load admin simulations."}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
            Scenario Simulation
          </p>
          <h3 className="mt-2 font-serif text-2xl font-semibold text-text-primary">
            {title || "Scenario Workbench"}
          </h3>
          <p className="mt-2 max-w-4xl text-sm text-text-muted">{data.headline}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted">
          {data.scenarios.length} scenarios
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {data.scenarios.map((scenario) => (
          <a
            key={scenario.id}
            href={scenario.href}
            className={`rounded-xl border p-4 transition hover:border-white/20 hover:bg-white/[0.04] ${toneClasses(scenario.tone)}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-medium text-text-primary">{scenario.title}</h4>
                <p className="mt-2 text-sm text-text-muted">{scenario.summary}</p>
              </div>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-text-muted">
                {scenario.confidence}
              </span>
            </div>

            <div className="mt-4 grid gap-2">
              {scenario.outcomes.map((outcome) => (
                <div
                  key={`${scenario.id}-${outcome.label}`}
                  className="rounded-lg border border-white/10 bg-page px-3 py-3"
                >
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">
                    {outcome.label}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <p className="text-xs text-text-muted">
                      Current: <span className="text-text-primary">{outcome.current}</span>
                    </p>
                    <p className="text-xs text-text-muted">
                      Base: <span className="text-text-primary">{outcome.base}</span>
                    </p>
                    <p className="text-xs text-emerald-300">Best: {outcome.best}</p>
                    <p className="text-xs text-red-300">Worst: {outcome.worst}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {scenario.assumptions.map((assumption) => (
                <span
                  key={assumption}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-text-muted"
                >
                  {assumption}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
