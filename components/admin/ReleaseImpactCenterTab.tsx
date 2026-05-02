"use client";

import { useMemo, useState } from "react";
import StatCard from "@/components/admin/StatCard";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import type { ReleaseImpactSnapshot } from "@/lib/admin/release-impact";
import type { StatisticalSignificance } from "@/lib/admin/statistics";

function attentionClasses(attention: "lift" | "watch" | "regression") {
  if (attention === "lift") return "bg-emerald-500/10 text-emerald-300";
  if (attention === "regression") return "bg-red-500/10 text-red-300";
  return "bg-amber-500/10 text-amber-200";
}

function deltaClass(value: number) {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-red-300";
  return "text-text-muted";
}

function signed(value: number, suffix = "") {
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function significanceClasses(value: StatisticalSignificance) {
  if (value === "significant-lift") return "bg-emerald-500/10 text-emerald-300";
  if (value === "significant-regression") return "bg-red-500/10 text-red-300";
  if (value === "inconclusive") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

export default function ReleaseImpactCenterTab({ initialDays = 30 }: { initialDays?: number }) {
  const [days, setDays] = useState(initialDays);
  const [search, setSearch] = useState("");
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ReleaseImpactSnapshot>(
    "/api/admin/release-impact",
    params
  );

  const releases = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.releases.filter((entry) => {
      if (!needle) return true;
      return [
        entry.title,
        entry.category,
        entry.primaryMetricKey,
        entry.primaryMetricLabel,
        entry.expectedImpact,
        entry.measuredOutcome,
      ]
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
        {error || "Failed to load release impact center."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Release Impact Center</h3>
          <p className="mt-1 text-sm text-text-muted">
            Compare pre and post-release movement, metric linkage, governance context, and chart
            annotations in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search release, metric, or category"
            className="w-full min-w-72 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
          />
          <TimeRangeSelector value={days} onChange={setDays} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Releases" value={data.summary.totalReleases} />
        <StatCard label="Regressions" value={data.summary.regressions} />
        <StatCard label="Lifts" value={data.summary.lifts} />
        <StatCard label="Metric Linked" value={data.summary.withMetricLink} />
        <StatCard label="Decision Linked" value={data.summary.withDecisionLink} />
        <StatCard label="Annotated" value={data.summary.annotated} />
      </div>

      <div className="space-y-4">
        {releases.map((entry) => (
          <a
            key={entry.id}
            href={entry.href}
            className="block rounded-xl border border-white/10 bg-surface p-5 transition hover:border-white/20"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    {entry.category}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${attentionClasses(
                      entry.attention
                    )}`}
                  >
                    {entry.attention}
                  </span>
                  {entry.primaryMetricLabel && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {entry.primaryMetricLabel}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-lg font-semibold text-text-primary">{entry.title}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {new Date(entry.eventDate).toLocaleDateString()}
                  {entry.reviewDate ? ` | review ${entry.reviewDate}` : ""}
                </p>
              </div>
              <div className="grid gap-2 text-right sm:grid-cols-3">
                <p className={`text-sm font-semibold ${deltaClass(entry.deltaSubmissions)}`}>
                  {signed(entry.deltaSubmissions)} starts
                </p>
                <p className={`text-sm font-semibold ${deltaClass(entry.deltaCompletionRate)}`}>
                  {signed(entry.deltaCompletionRate, "pp")} completion
                </p>
                <p className={`text-sm font-semibold ${deltaClass(entry.deltaWaitlist)}`}>
                  {signed(entry.deltaWaitlist)} waitlist
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              <MetaTile label="Expected Impact" value={entry.expectedImpact ?? "Not recorded"} />
              <MetaTile label="Measured Outcome" value={entry.measuredOutcome ?? "Monitoring"} />
              <MetaTile label="Linked Decisions" value={String(entry.linkedDecisionCount)} />
              <MetaTile label="Linked Notes" value={String(entry.linkedAnnotationCount)} />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <SignalTile
                label="Starts Confidence"
                significance={entry.submissionsSignal.significance}
                summary={entry.submissionsSignal.summary}
                pValue={entry.submissionsSignal.pValue}
                ciLabel={entry.submissionsSignal.ciLabel}
              />
              <SignalTile
                label="Completion Confidence"
                significance={entry.completionSignal.significance}
                summary={entry.completionSignal.summary}
                pValue={entry.completionSignal.pValue}
                ciLabel={entry.completionSignal.ciLabel}
              />
              <SignalTile
                label="Waitlist Confidence"
                significance={entry.waitlistSignal.significance}
                summary={entry.waitlistSignal.summary}
                pValue={entry.waitlistSignal.pValue}
                ciLabel={entry.waitlistSignal.ciLabel}
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {entry.notes.map((note) => (
                <div
                  key={note}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-text-muted"
                >
                  {note}
                </div>
              ))}
            </div>
          </a>
        ))}
        {releases.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
            No release-impact entries match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm text-text-primary">{value}</p>
    </div>
  );
}

function SignalTile({
  label,
  significance,
  summary,
  pValue,
  ciLabel,
}: {
  label: string;
  significance: StatisticalSignificance;
  summary: string;
  pValue: number | null;
  ciLabel: string | null;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${significanceClasses(significance)}`}
        >
          {significance}
        </span>
      </div>
      <p className="mt-2 text-sm text-text-primary">{summary}</p>
      <p className="mt-2 text-xs text-text-muted">
        {pValue != null ? `p=${pValue}` : "p-value unavailable"}
        {ciLabel ? ` | ${ciLabel}` : ""}
      </p>
    </div>
  );
}
