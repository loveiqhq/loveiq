"use client";

import { useState } from "react";
import EmbeddedIntelligencePanel from "@/components/admin/EmbeddedIntelligencePanel";
import type { LeadCockpitRole, LeadCockpitSnapshot } from "@/lib/admin/os-types";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";

function decisionSurfaceForRole(role: LeadCockpitRole) {
  return role === "tech" ? "health" : role;
}

export default function RoleCockpitDashboard({ role }: { role: LeadCockpitRole }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useAdminFetch<LeadCockpitSnapshot>(`/api/admin/lead/${role}`, {
    days: String(days),
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
        {error || "Failed to load lead cockpit"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
            Role Cockpit
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-text-primary">{data.label}</h2>
          <p className="mt-2 max-w-3xl text-sm text-text-muted">{data.summary}</p>
        </div>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <StatCard
            key={metric.key}
            label={metric.label}
            value={metric.value}
            sub={metric.detail}
            delta={metric.delta}
          />
        ))}
      </div>

      <EmbeddedIntelligencePanel
        surface={decisionSurfaceForRole(role)}
        days={days}
        title={`${data.label} Decision Copilot`}
        endpoint="/api/admin/decision-intelligence"
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <section>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Priority Queue</h3>
          <div className="mt-3 space-y-3">
            {data.priorities.map((item) => (
              <a
                key={`${item.title}-${item.href}`}
                href={item.href}
                className="block rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
              >
                <p className="font-medium text-text-primary">{item.title}</p>
                <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
              </a>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Supporting Reads</h3>
          <div className="mt-3 space-y-3">
            {data.supporting.map((item) => (
              <a
                key={`${item.label}-${item.href}`}
                href={item.href}
                className="block rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">{item.label}</p>
                  <span className="font-serif text-lg font-semibold text-text-primary">
                    {item.value}
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
              </a>
            ))}
          </div>
        </section>
      </div>

      {data.leadingIndicators && data.leadingIndicators.length > 0 && (
        <section>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Leading Indicators</h3>
          <div className="mt-3 grid gap-4 xl:grid-cols-2">
            {data.leadingIndicators.map((item) => (
              <a
                key={`${item.metricKey}-${item.leadingMetricKey}`}
                href={item.href}
                className="rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-text-muted">
                      {item.metricLabel}
                    </p>
                    <p className="mt-1 font-medium text-text-primary">{item.leadingMetricLabel}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                      item.signalState === "positive"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : item.signalState === "negative"
                          ? "bg-red-500/10 text-red-300"
                          : "bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {item.signalState}
                  </span>
                </div>
                <p className="mt-3 text-sm text-text-muted">
                  {item.leadingMetricValueLabel} | {item.detail}
                </p>
              </a>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Tracked Actions</h3>
          <div className="mt-3 space-y-3">
            {data.actions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
                No actions are currently linked to this cockpit.
              </div>
            ) : (
              data.actions.map((item) => (
                <a
                  key={item.id}
                  href={item.linkedHref ?? "/admin"}
                  className="block rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-text-primary">{item.title}</p>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-text-primary">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">
                    {item.description || "No additional context logged."}
                  </p>
                </a>
              ))
            )}
          </div>
        </section>

        <section>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Recent Timeline</h3>
          <div className="mt-3 space-y-3">
            {data.timeline.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="block rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">{item.title}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {item.kind}
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
