"use client";

import { useMemo } from "react";
import StatCard from "@features/admin/ui/StatCard";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import type {
  CohortComparisonSnapshot,
  ExperimentComparisonEntry,
  ReleaseComparisonEntry,
  VersionComparisonEntry,
} from "@features/admin/server/cohort-comparison";
import type { CohortComparisonMode } from "@features/admin/server/drilldowns";
import type { StatisticalSignificance } from "@features/admin/server/statistics";

interface ImpactComparisonTabProps {
  days: number;
  comparisonMode: CohortComparisonMode;
  onComparisonModeChange: (value: CohortComparisonMode) => void;
}

const COMPARISON_OPTIONS: Array<{ value: CohortComparisonMode; label: string; detail: string }> = [
  {
    value: "release",
    label: "Release",
    detail: "Compare launch windows using the changelog impact model.",
  },
  {
    value: "version",
    label: "Version",
    detail: "Compare scored cohorts by engine version.",
  },
  {
    value: "experiment",
    label: "Experiment",
    detail: "Compare control vs variant readouts and decision rigor.",
  },
];

function attentionClasses(attention: ReleaseComparisonEntry["attention"]) {
  if (attention === "lift") return "bg-emerald-500/10 text-emerald-300";
  if (attention === "regression") return "bg-red-500/10 text-red-300";
  return "bg-amber-500/10 text-amber-200";
}

function toneClasses(
  tone: VersionComparisonEntry["tone"] | ExperimentComparisonEntry["decisionTone"]
) {
  if (tone === "good") return "bg-emerald-500/10 text-emerald-300";
  if (tone === "risk") return "bg-red-500/10 text-red-300";
  if (tone === "watch") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

function significanceClasses(value: StatisticalSignificance) {
  if (value === "significant-lift") return "bg-emerald-500/10 text-emerald-300";
  if (value === "significant-regression") return "bg-red-500/10 text-red-300";
  if (value === "inconclusive") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

function signed(value: number, suffix = "") {
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

export default function ImpactComparisonTab({
  days,
  comparisonMode,
  onComparisonModeChange,
}: ImpactComparisonTabProps) {
  const params = useMemo(() => ({ days: String(days > 0 ? days : 30) }), [days]);
  const { data, loading, error } = useAdminFetch<CohortComparisonSnapshot>(
    "/api/admin/funnels/impact-comparison",
    params
  );
  const summary = useMemo(
    () => ({
      releaseComparisons: data?.summary?.releaseComparisons ?? 0,
      versionComparisons: data?.summary?.versionComparisons ?? 0,
      experimentComparisons: data?.summary?.experimentComparisons ?? 0,
      strongestRelease: data?.summary?.strongestRelease ?? null,
      strongestVersion: data?.summary?.strongestVersion ?? null,
      strongestExperiment: data?.summary?.strongestExperiment ?? null,
    }),
    [data]
  );
  const trust = useMemo(
    () => ({
      warning: data?.trust?.warning ?? null,
      notes: Array.isArray(data?.trust?.notes) ? data.trust.notes : [],
    }),
    [data]
  );
  const releaseComparisons = useMemo(
    () => (Array.isArray(data?.releaseComparisons) ? data.releaseComparisons : []),
    [data]
  );
  const versionComparisons = useMemo(
    () => (Array.isArray(data?.versionComparisons) ? data.versionComparisons : []),
    [data]
  );
  const experimentComparisons = useMemo(
    () => (Array.isArray(data?.experimentComparisons) ? data.experimentComparisons : []),
    [data]
  );

  const summaryCards = useMemo(() => {
    if (!data) return [];

    if (comparisonMode === "release") {
      const lifts = releaseComparisons.filter((entry) => entry.attention === "lift").length;
      const regressions = releaseComparisons.filter(
        (entry) => entry.attention === "regression"
      ).length;
      const linkedExperiments = releaseComparisons.reduce(
        (sum, entry) => sum + entry.linkedExperimentCount,
        0
      );
      return [
        { label: "Compared Releases", value: summary.releaseComparisons },
        { label: "Lift Windows", value: lifts },
        { label: "Regression Windows", value: regressions },
        { label: "Linked Experiments", value: linkedExperiments },
      ];
    }

    if (comparisonMode === "version") {
      const totalSample = versionComparisons.reduce((sum, entry) => sum + entry.sampleSize, 0);
      const hybridAgreement = versionComparisons.find((entry) => entry.versionKey === "v4+v5");
      return [
        { label: "Version Buckets", value: summary.versionComparisons },
        { label: "Scored Sample", value: totalSample.toLocaleString() },
        { label: "Top Completion", value: summary.strongestVersion ?? "No data" },
        {
          label: "Hybrid Agreement",
          value:
            hybridAgreement?.agreementRate != null
              ? `${hybridAgreement.agreementRate}%`
              : "No dual rows",
        },
      ];
    }

    const significantResults = experimentComparisons.filter(
      (entry) =>
        entry.significance === "significant-lift" || entry.significance === "significant-regression"
    ).length;
    const guardrailRisks = experimentComparisons.reduce(
      (sum, entry) => sum + entry.guardrailRiskCount,
      0
    );

    return [
      { label: "Compared Experiments", value: summary.experimentComparisons },
      { label: "Significant Readouts", value: significantResults },
      { label: "Guardrail Risks", value: guardrailRisks },
      { label: "Top Signal", value: summary.strongestExperiment ?? "No data" },
    ];
  }, [
    comparisonMode,
    data,
    experimentComparisons,
    releaseComparisons,
    summary,
    versionComparisons,
  ]);

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
        {error || "Failed to load impact comparison."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Impact Comparison</h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Compare cohort movement by release window, engine version, or experiment readout without
            leaving the funnel workspace.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      {trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {trust.warning}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {COMPARISON_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onComparisonModeChange(option.value)}
            className={`rounded-xl border p-4 text-left transition ${
              comparisonMode === option.value
                ? "border-white/20 bg-white/10"
                : "border-white/10 bg-surface hover:border-white/20 hover:bg-white/5"
            }`}
          >
            <p className="text-sm font-semibold text-text-primary">{option.label}</p>
            <p className="mt-1 text-sm text-text-muted">{option.detail}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {trust.notes.map((note) => (
          <div
            key={note}
            className="rounded-xl border border-white/10 bg-surface p-4 text-sm text-text-muted"
          >
            {note}
          </div>
        ))}
      </div>

      {comparisonMode === "release" && (
        <div className="grid gap-4 xl:grid-cols-2">
          {releaseComparisons.map((entry) => (
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
                    {entry.eventDate} | {entry.compareWindowLabel}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-muted">
                  {entry.completionSummary}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetricTile label="Starts" value={signed(entry.deltaSubmissions)} />
                <MetricTile label="Completion" value={signed(entry.deltaCompletionRate, "pp")} />
                <MetricTile label="Waitlist" value={signed(entry.deltaWaitlist)} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetaTile label="Completion signal" value={entry.completionSignal} />
                <MetaTile label="Linked decisions" value={String(entry.linkedDecisionCount)} />
                <MetaTile label="Linked experiments" value={String(entry.linkedExperimentCount)} />
              </div>
            </a>
          ))}
        </div>
      )}

      {comparisonMode === "version" && (
        <div className="grid gap-4 xl:grid-cols-2">
          {versionComparisons.map((entry) => (
            <a
              key={entry.versionKey}
              href={entry.href}
              className="block rounded-xl border border-white/10 bg-surface p-5 transition hover:border-white/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${toneClasses(entry.tone)}`}
                    >
                      {entry.tone}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {entry.shareOfScored}% of scored rows
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{entry.label}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    Dominant archetype: {entry.dominantArchetype ?? "No dominant pattern yet"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-muted">
                  {entry.sampleSize.toLocaleString()} scored submissions
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetricTile label="Completion" value={`${entry.completionRate}%`} />
                <MetricTile
                  label="Avg duration"
                  value={
                    entry.avgDurationMinutes != null ? `${entry.avgDurationMinutes} min` : "No data"
                  }
                />
                <MetricTile
                  label="Agreement"
                  value={entry.agreementRate != null ? `${entry.agreementRate}%` : "No dual rows"}
                />
              </div>

              <div className="mt-4 space-y-2">
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
        </div>
      )}

      {comparisonMode === "experiment" && (
        <div className="grid gap-4 xl:grid-cols-2">
          {experimentComparisons.map((entry) => (
            <a
              key={entry.id}
              href={entry.href}
              className="block rounded-xl border border-white/10 bg-surface p-5 transition hover:border-white/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${toneClasses(entry.decisionTone)}`}
                    >
                      {entry.decisionLabel}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${significanceClasses(
                        entry.significance
                      )}`}
                    >
                      {entry.significanceLabel}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {entry.confidence} confidence
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{entry.name}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    {entry.primaryMetricLabel}
                    {entry.segmentName ? ` | ${entry.segmentName}` : ""}
                    {` | ${entry.compareWindowLabel}`}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-muted">
                  {entry.summary}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetricTile label="Control" value={entry.controlRateLabel ?? "Not entered"} />
                <MetricTile label="Variant" value={entry.variantRateLabel ?? "Not entered"} />
                <MetricTile label="Observed delta" value={entry.deltaLabel ?? "No delta"} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MetaTile label="Confidence score" value={`${entry.confidenceScore}%`} />
                <MetaTile label="Guardrail risks" value={String(entry.guardrailRiskCount)} />
                <MetaTile label="Blindspots" value={String(entry.blindspotCount)} />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}
