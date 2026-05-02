"use client";

import { useState } from "react";
import AdminReviewRequestButton from "@/components/admin/AdminReviewRequestButton";
import StatCard from "@/components/admin/StatCard";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import type { IncidentCorrelationSnapshot } from "@/lib/admin/incident-correlation-types";

function severityClasses(value: "risk" | "watch") {
  return value === "risk" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-200";
}

function confidenceClasses(value: "high" | "medium" | "low") {
  if (value === "high") return "bg-emerald-500/10 text-emerald-300";
  if (value === "medium") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

function reviewDateForSeverity(severity: "risk" | "watch") {
  const days = severity === "risk" ? 7 : 14;
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export default function IncidentCorrelationTab() {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useAdminFetch<IncidentCorrelationSnapshot>(
    "/api/admin/incidents/correlation",
    { days: String(days) }
  );

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
        {error || "Failed to load incident correlation."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Incident Correlation Timeline</h3>
          <p className="mt-1 text-xs text-text-muted">
            Link current business, trust, and service anomalies to the most likely recent releases,
            experiments, and governance changes.
          </p>
        </div>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Incidents" value={data.summary.incidents} />
        <StatCard label="High Confidence" value={data.summary.highConfidence} />
        <StatCard label="Release Linked" value={data.summary.releaseLinked} />
        <StatCard label="Service / Trust" value={data.summary.trackingOrService} />
      </div>

      <div className="space-y-4">
        {data.entries.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${severityClasses(entry.severity)}`}
                  >
                    {entry.severity}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${confidenceClasses(entry.confidence)}`}
                  >
                    {entry.confidence} confidence
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {entry.category}
                  </span>
                  {entry.metricKey && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {entry.metricKey}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-lg font-semibold text-text-primary">{entry.title}</p>
                <p className="mt-1 text-sm text-text-muted">{entry.currentSignal}</p>
                <p className="mt-2 text-xs text-text-muted">
                  {entry.ownerEmail ? `Owner ${entry.ownerEmail}` : "No owner mapped"} · Updated{" "}
                  {new Date(data.generatedAt).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Likely Drivers</p>
              <div className="mt-3 space-y-3">
                {entry.suspectedDrivers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-text-muted">
                    No recent change matched strongly. Treat this as a likely infra, tracking, or
                    background-data issue first.
                  </div>
                ) : (
                  entry.suspectedDrivers.map((driver) => (
                    <a
                      key={`${entry.id}-${driver.kind}-${driver.title}`}
                      href={driver.href}
                      className="block rounded-lg border border-white/10 bg-surface px-3 py-3 transition hover:border-white/20 hover:bg-white/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{driver.title}</p>
                          <p className="mt-1 text-xs text-text-muted">{driver.detail}</p>
                        </div>
                        <div className="text-right text-xs text-text-muted">
                          <p>{driver.kind}</p>
                          <p className="mt-1">{new Date(driver.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </a>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-primary">
              {entry.recommendation}
            </div>

            <div className="mt-4">
              <AdminReviewRequestButton
                title={`Review incident correlation: ${entry.title}`}
                description={entry.currentSignal}
                resourceType="general"
                linkedMetricKey={entry.metricKey ?? null}
                impactLevel={entry.severity === "risk" ? "high" : "medium"}
                reviewerEmail={entry.ownerEmail ?? null}
                sourceHref="/admin/health?tab=Incident%20Correlation"
                dueDate={reviewDateForSeverity(entry.severity)}
                payloadSnapshot={{
                  incidentId: entry.id,
                  category: entry.category,
                  confidence: entry.confidence,
                  suspectedDrivers: entry.suspectedDrivers.map((driver) => ({
                    kind: driver.kind,
                    title: driver.title,
                    date: driver.date,
                  })),
                }}
                label="Request review"
                busyLabel="Requesting..."
                successLabel="Queued"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
