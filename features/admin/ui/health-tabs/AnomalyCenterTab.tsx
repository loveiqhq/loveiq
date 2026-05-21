"use client";

import { useState } from "react";
import AdminReviewRequestButton from "@features/admin/ui/AdminReviewRequestButton";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import type { AdminAnomalySnapshot, AdminOsTone } from "@features/admin/server/os-types";
import StatCard from "@features/admin/ui/StatCard";
import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";

function reviewDateForSeverity(severity: AdminOsTone) {
  const days = severity === "risk" ? 7 : severity === "watch" ? 14 : 21;
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export default function AnomalyCenterTab() {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useAdminFetch<AdminAnomalySnapshot>("/api/admin/anomalies", {
    days: String(days),
  });

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
        {error || "Failed to load anomaly center."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Anomaly Center</h3>
          <p className="mt-1 text-xs text-text-muted">
            Risk and watch signals generated from guardrails, trust, actions, and decision flow.
          </p>
        </div>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Signals" value={data.summary.total} />
        <StatCard label="Risk" value={data.summary.risk} />
        <StatCard label="Watch" value={data.summary.watch} />
        <StatCard label="Matched Rules" value={data.summary.matchedRules} />
      </div>

      <div className="space-y-3">
        {data.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
            No active anomalies in the selected window.
          </div>
        ) : (
          data.items.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-surface p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-text-primary">{item.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        item.severity === "risk"
                          ? "bg-red-500/10 text-red-300"
                          : "bg-amber-500/10 text-amber-200"
                      }`}
                    >
                      {item.severity}
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                      {item.category}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
                  <p className="mt-2 text-xs text-text-muted">
                    Current value: {item.value}
                    {item.ownerEmail ? ` · owner ${item.ownerEmail}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-3">
                  {item.matchedRules.length > 0 && (
                    <div className="min-w-48 rounded-lg border border-white/10 bg-black/10 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        Matched rules
                      </p>
                      <div className="mt-2 space-y-1">
                        {item.matchedRules.map((rule) => (
                          <div key={rule.id} className="text-xs text-text-primary">
                            {rule.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <a
                    href={item.href}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                  >
                    Open source
                  </a>
                </div>
              </div>
              <div className="mt-4">
                <AdminReviewRequestButton
                  title={`Review anomaly: ${item.title}`}
                  description={item.detail}
                  resourceType="general"
                  linkedMetricKey={item.category === "service" ? null : item.targetKey}
                  impactLevel={item.severity === "risk" ? "high" : "medium"}
                  reviewerEmail={item.ownerEmail ?? null}
                  sourceHref="/admin/health?tab=Anomaly%20Center"
                  dueDate={reviewDateForSeverity(item.severity)}
                  payloadSnapshot={{
                    anomalyId: item.id,
                    category: item.category,
                    severity: item.severity,
                    value: item.value,
                    matchedRuleIds: item.matchedRules.map((rule) => rule.id),
                  }}
                  label="Request review"
                  busyLabel="Requesting..."
                  successLabel="Queued"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
