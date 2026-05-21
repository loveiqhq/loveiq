"use client";

import { useMemo, useState } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface MetricImpactItem {
  id: string;
  kind: "release" | "decision" | "experiment" | "action";
  numericId: number;
  title: string;
  ownerEmail: string | null;
  statusLabel: string;
  expectedImpact: string | null;
  measuredOutcome: string | null;
  reviewDate: string | null;
  timestamp: string;
  href: string;
  attentionNeeded: boolean;
}

interface MetricImpactGroup {
  metricKey: string;
  label: string;
  description: string;
  ownerEmail: string | null;
  stewardshipRole: string | null;
  currentValueLabel: string;
  trustMode: string | null;
  linkedHref: string;
  openReviewItems: number;
  counts: {
    total: number;
    releases: number;
    decisions: number;
    experiments: number;
    actions: number;
  };
  items: MetricImpactItem[];
}

interface MetricImpactData {
  generatedAt: string;
  summary: {
    metricsWithActivity: number;
    linkedItems: number;
    openReviewItems: number;
    metricsWithoutOwner: number;
    unlinkedChanges: number;
  };
  unlinkedByKind: Record<"release" | "decision" | "experiment" | "action", number>;
  groups: MetricImpactGroup[];
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

export default function MetricImpactTab() {
  const [search, setSearch] = useState("");
  const { data, loading, error } = useAdminFetch<MetricImpactData>("/api/admin/metric-impact");

  const groups = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.groups.filter((group) => {
      if (needle.length === 0) return true;
      return [group.metricKey, group.label, group.description, group.ownerEmail]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(needle));
    });
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
        {error || "Failed to load metric impact."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-bold text-text-primary">Metric Impact</h2>
        <p className="mt-1 text-sm text-text-muted">
          Canonical metric view across releases, decisions, experiments, and action follow-through.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile
          label="Metrics With Activity"
          value={String(data.summary.metricsWithActivity)}
        />
        <SummaryTile label="Linked Items" value={String(data.summary.linkedItems)} />
        <SummaryTile label="Open Reviews" value={String(data.summary.openReviewItems)} />
        <SummaryTile label="No Metric Owner" value={String(data.summary.metricsWithoutOwner)} />
        <SummaryTile label="Unlinked Changes" value={String(data.summary.unlinkedChanges)} />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search metric key, label, or owner"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-white/20 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2 text-xs text-text-muted">
            <span className="rounded-full bg-white/5 px-3 py-2">
              releases {data.unlinkedByKind.release}
            </span>
            <span className="rounded-full bg-white/5 px-3 py-2">
              decisions {data.unlinkedByKind.decision}
            </span>
            <span className="rounded-full bg-white/5 px-3 py-2">
              experiments {data.unlinkedByKind.experiment}
            </span>
            <span className="rounded-full bg-white/5 px-3 py-2">
              actions {data.unlinkedByKind.action}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {groups.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-surface p-6 text-sm text-text-muted">
            No metric groups match the current search.
          </p>
        )}
        {groups.map((group) => (
          <div key={group.metricKey} className="rounded-2xl border border-white/10 bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {group.metricKey}
                  </span>
                  {group.stewardshipRole && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {group.stewardshipRole}
                    </span>
                  )}
                  {group.trustMode && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {group.trustMode}
                    </span>
                  )}
                  {group.openReviewItems > 0 && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-200">
                      {group.openReviewItems} reviews due
                    </span>
                  )}
                </div>
                <p className="mt-2 text-lg font-semibold text-text-primary">{group.label}</p>
                <p className="mt-1 max-w-3xl text-sm text-text-muted">{group.description}</p>
              </div>
              <div className="text-right">
                <p className="font-serif text-2xl font-semibold text-text-primary">
                  {group.currentValueLabel}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {group.ownerEmail || "No metric owner assigned"}
                </p>
                <a
                  href={group.linkedHref}
                  className="mt-3 inline-flex text-sm text-cyan-300 hover:text-cyan-200"
                >
                  Open metric view
                </a>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              <SummaryTile label="Total" value={String(group.counts.total)} />
              <SummaryTile label="Releases" value={String(group.counts.releases)} />
              <SummaryTile label="Decisions" value={String(group.counts.decisions)} />
              <SummaryTile label="Experiments" value={String(group.counts.experiments)} />
              <SummaryTile label="Actions" value={String(group.counts.actions)} />
            </div>

            <div className="mt-4 space-y-3">
              {group.items.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                          {item.kind}
                        </span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                          {item.statusLabel}
                        </span>
                        {item.attentionNeeded && (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-200">
                            review due
                          </span>
                        )}
                      </div>
                      <p className="mt-2 font-medium text-text-primary">{item.title}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        {item.ownerEmail || "Unassigned"} |{" "}
                        {new Date(item.timestamp).toLocaleDateString()}
                        {item.reviewDate ? ` | review ${item.reviewDate}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">
                        Expected Impact
                      </p>
                      <p className="mt-1 text-sm text-text-primary">
                        {item.expectedImpact ?? "Not recorded"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">
                        Measured Outcome
                      </p>
                      <p className="mt-1 text-sm text-text-primary">
                        {item.measuredOutcome ?? "Still monitoring"}
                      </p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
