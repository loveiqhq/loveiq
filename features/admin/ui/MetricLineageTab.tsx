"use client";

import { useMemo, useState } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface DashboardTrustGroup {
  href: string;
  label: string;
  score: number;
  metrics: number;
  overdueMetrics: number;
  unownedMetrics: number;
  watchMetrics: number;
  weakestMetricLabels: string[];
}

interface MetricLineageNode {
  id: number;
  metricKey: string;
  label: string;
  ownerEmail: string | null;
  stewardshipRole: string | null;
  linkedHref: string;
  currentValueLabel: string;
  trustMode: string;
  reviewStatus: "fresh" | "due" | "overdue" | "never";
  status: string;
  sourceOfTruth: string | null;
  formula: string | null;
  trustNote: string | null;
  caveats: string | null;
  trustScore: number;
  upstream: Array<{
    metricKey: string;
    label: string;
    strength: "weak" | "medium" | "strong";
    note: string | null;
  }>;
  downstream: Array<{
    metricKey: string;
    label: string;
    strength: "weak" | "medium" | "strong";
    note: string | null;
  }>;
}

interface MetricLineageData {
  generatedAt: string;
  summary: {
    dashboards: number;
    averageTrustScore: number;
    overdueMetrics: number;
    unownedMetrics: number;
    orphanMetrics: number;
    dependencyLinks: number;
  };
  dashboardTrust: DashboardTrustGroup[];
  metrics: MetricLineageNode[];
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function scoreTone(score: number): string {
  if (score >= 85) return "bg-emerald-500/10 text-emerald-300";
  if (score >= 65) return "bg-amber-500/10 text-amber-200";
  return "bg-red-500/10 text-red-300";
}

function dependencyTone(strength: "weak" | "medium" | "strong"): string {
  if (strength === "strong") return "bg-emerald-500/10 text-emerald-300";
  if (strength === "medium") return "bg-cyan-500/10 text-cyan-300";
  return "bg-white/10 text-text-muted";
}

export default function MetricLineageTab() {
  const [search, setSearch] = useState("");
  const { data, loading, error } = useAdminFetch<MetricLineageData>("/api/admin/metric-lineage");

  const metrics = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return data.metrics;
    return data.metrics.filter((metric) =>
      [
        metric.metricKey,
        metric.label,
        metric.ownerEmail,
        metric.stewardshipRole,
        metric.sourceOfTruth,
        metric.formula,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(needle))
    );
  }, [data, search]);

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
        {error || "Failed to load lineage and trust."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-bold text-text-primary">Lineage & Trust</h2>
        <p className="mt-1 text-sm text-text-muted">
          Inspect metric dependencies, source-of-truth coverage, and per-dashboard trust scores.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryTile label="Dashboards" value={String(data.summary.dashboards)} />
        <SummaryTile label="Avg Trust" value={`${data.summary.averageTrustScore}`} />
        <SummaryTile label="Overdue Metrics" value={String(data.summary.overdueMetrics)} />
        <SummaryTile label="Unowned Metrics" value={String(data.summary.unownedMetrics)} />
        <SummaryTile label="Orphan Metrics" value={String(data.summary.orphanMetrics)} />
        <SummaryTile label="Dependency Links" value={String(data.summary.dependencyLinks)} />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-semibold text-text-primary">Dashboard Trust</h3>
            <p className="mt-1 text-sm text-text-muted">
              Derived trust scores for admin surfaces based on owner coverage, review freshness, and
              trust mode.
            </p>
          </div>
          <p className="text-xs text-text-muted">
            Updated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {data.dashboardTrust.map((group) => (
            <a
              key={group.href}
              href={group.href}
              className="rounded-2xl border border-white/10 bg-surface p-5 transition hover:border-white/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-text-primary">{group.label}</p>
                  <p className="mt-1 text-sm text-text-muted">{group.href}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${scoreTone(group.score)}`}
                >
                  {group.score}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <SummaryTile label="Metrics" value={String(group.metrics)} />
                <SummaryTile label="Overdue" value={String(group.overdueMetrics)} />
                <SummaryTile label="Unowned" value={String(group.unownedMetrics)} />
                <SummaryTile label="Watch" value={String(group.watchMetrics)} />
              </div>

              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Weakest Metrics</p>
                <p className="mt-2 text-sm text-text-primary">
                  {group.weakestMetricLabels.length > 0
                    ? group.weakestMetricLabels.join(", ")
                    : "No metric weaknesses detected."}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-serif text-lg font-semibold text-text-primary">Metric Lineage</h3>
          <p className="mt-1 text-sm text-text-muted">
            Search canonical metrics to inspect source definitions, upstream drivers, and downstream
            effects.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search metric key, owner, source, or formula"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
          />
        </div>

        <div className="grid gap-4">
          {metrics.length === 0 && (
            <p className="rounded-xl border border-white/10 bg-surface p-6 text-sm text-text-muted">
              No metrics match the current search.
            </p>
          )}
          {metrics.map((metric) => (
            <div key={metric.id} className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {metric.metricKey}
                    </span>
                    {metric.stewardshipRole && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {metric.stewardshipRole}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${scoreTone(metric.trustScore)}`}
                    >
                      trust {metric.trustScore}
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{metric.label}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    {metric.ownerEmail || "No owner assigned"} | {metric.currentValueLabel} |{" "}
                    {metric.reviewStatus}
                  </p>
                </div>
                <a href={metric.linkedHref} className="text-sm text-cyan-300 hover:text-cyan-200">
                  Open metric view
                </a>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Source Of Truth</p>
                  <p className="mt-1 text-sm text-text-primary">
                    {metric.sourceOfTruth || "Not documented"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Formula</p>
                  <p className="mt-1 text-sm text-text-primary">
                    {metric.formula || "Not documented"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Trust Mode</p>
                  <p className="mt-1 text-sm text-text-primary">
                    {metric.trustMode} | status {metric.status}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-wide text-text-muted">
                    Upstream Drivers
                  </p>
                  <div className="mt-3 space-y-3">
                    {metric.upstream.length === 0 ? (
                      <p className="text-sm text-text-muted">No upstream dependencies logged.</p>
                    ) : (
                      metric.upstream.map((dependency) => (
                        <div
                          key={`${metric.id}-up-${dependency.metricKey}`}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${dependencyTone(dependency.strength)}`}
                            >
                              {dependency.strength}
                            </span>
                            <span className="text-sm font-medium text-text-primary">
                              {dependency.label}
                            </span>
                          </div>
                          {dependency.note && (
                            <p className="mt-2 text-sm text-text-muted">{dependency.note}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-wide text-text-muted">
                    Downstream Effects
                  </p>
                  <div className="mt-3 space-y-3">
                    {metric.downstream.length === 0 ? (
                      <p className="text-sm text-text-muted">No downstream dependencies logged.</p>
                    ) : (
                      metric.downstream.map((dependency) => (
                        <div
                          key={`${metric.id}-down-${dependency.metricKey}`}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${dependencyTone(dependency.strength)}`}
                            >
                              {dependency.strength}
                            </span>
                            <span className="text-sm font-medium text-text-primary">
                              {dependency.label}
                            </span>
                          </div>
                          {dependency.note && (
                            <p className="mt-2 text-sm text-text-muted">{dependency.note}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {(metric.trustNote || metric.caveats) && (
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {metric.trustNote && (
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Trust Note</p>
                      <p className="mt-1 text-sm text-text-primary">{metric.trustNote}</p>
                    </div>
                  )}
                  {metric.caveats && (
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Caveats</p>
                      <p className="mt-1 text-sm text-text-primary">{metric.caveats}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
