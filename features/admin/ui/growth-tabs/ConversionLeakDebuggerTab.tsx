"use client";

import { useMemo, useState, useTransition } from "react";
import StatCard from "@features/admin/ui/StatCard";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import type {
  ConversionLeakDebuggerSnapshot,
  LeakDebuggerRow,
  LeakDimensionSnapshot,
} from "@features/admin/server/conversion-leak-debugger";

type LeakDimension = keyof ConversionLeakDebuggerSnapshot["dimensions"];

const DIMENSION_ORDER: LeakDimension[] = ["source", "campaign", "segment", "geo", "device"];

function toneClasses(tone: LeakDebuggerRow["tone"]) {
  if (tone === "critical") return "bg-red-500/10 text-red-300";
  if (tone === "watch") return "bg-amber-500/10 text-amber-200";
  if (tone === "blindspot") return "bg-white/10 text-text-muted";
  return "bg-emerald-500/10 text-emerald-300";
}

function confidenceClasses(confidence: LeakDebuggerRow["confidence"]) {
  if (confidence === "high") return "bg-emerald-500/10 text-emerald-300";
  if (confidence === "medium") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

function rateLabel(value: number | null) {
  return value != null ? `${value}%` : "Not enough flow";
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function PriorityCard({
  dimensionLabel,
  item,
}: {
  dimensionLabel: string;
  item: ConversionLeakDebuggerSnapshot["priorities"][number];
}) {
  return (
    <a
      href={item.href}
      className="block rounded-xl border border-white/10 bg-surface p-5 transition hover:border-white/20"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
          {dimensionLabel}
        </span>
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-red-300">
          {item.leakStageLabel}
        </span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
          {item.confidence} confidence
        </span>
      </div>
      <p className="mt-3 text-base font-semibold text-text-primary">{item.label}</p>
      <p className="mt-2 text-sm text-text-muted">{item.explanation}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricTile label="Leak Count" value={item.leakCount.toLocaleString()} />
        <MetricTile label="Leak Rate" value={`${item.leakRate}%`} />
      </div>
    </a>
  );
}

function LeakRowCard({ row }: { row: LeakDebuggerRow }) {
  return (
    <a
      href={row.href}
      className="block rounded-xl border border-white/10 bg-surface p-5 transition hover:border-white/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${toneClasses(
                row.tone
              )}`}
            >
              {row.tone}
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
              {row.leakStageLabel}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${confidenceClasses(
                row.confidence
              )}`}
            >
              {row.confidence} confidence
            </span>
          </div>
          <p className="mt-3 text-lg font-semibold text-text-primary">{row.label}</p>
          <p className="mt-2 text-sm text-text-muted">{row.explanation}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Starts</p>
          <p className="mt-1 text-base font-semibold text-text-primary">
            {row.starts.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricTile label="Leak Count" value={row.leakCount.toLocaleString()} />
        <MetricTile label="Leak Rate" value={`${row.leakRate}%`} />
        <MetricTile label="Completion" value={`${row.completionRate}%`} />
        <MetricTile label="Scored" value={rateLabel(row.scoringRate)} />
        <MetricTile label="Report View" value={rateLabel(row.reportRate)} />
        <MetricTile label="Paid" value={rateLabel(row.paidRate)} />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">Recovery signal</p>
        <p className="mt-1 text-sm text-text-primary">
          {row.resumedShare}% of starts in this slice resumed after a partial save.
        </p>
      </div>
    </a>
  );
}

function DimensionCard({
  snapshot,
  isActive,
  onClick,
}: {
  snapshot: LeakDimensionSnapshot;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        isActive
          ? "border-white/20 bg-white/10"
          : "border-white/10 bg-surface hover:border-white/20 hover:bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-text-primary">{snapshot.label}</p>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
          {snapshot.rows.length} rows
        </span>
      </div>
      <p className="mt-2 text-sm text-text-muted">{snapshot.description}</p>
      <p className="mt-3 text-xs text-text-muted">
        Strongest leak: {snapshot.strongestLeak ?? "No data in this window"}
      </p>
      {snapshot.trustNote && <p className="mt-2 text-xs text-amber-200">{snapshot.trustNote}</p>}
    </button>
  );
}

export default function ConversionLeakDebuggerTab({ days }: { days: number }) {
  const [activeDimension, setActiveDimension] = useState<LeakDimension>("source");
  const [isPending, startTransition] = useTransition();
  const params = useMemo(() => ({ days: String(days > 0 ? days : 30) }), [days]);
  const { data, loading, error } = useAdminFetch<ConversionLeakDebuggerSnapshot>(
    "/api/admin/growth/leak-debugger",
    params
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
        {error || "Failed to load conversion leak debugger."}
      </div>
    );
  }

  const activeSnapshot = data.dimensions[activeDimension];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Conversion Leak Debugger</h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Isolate the biggest sequential loss by source, campaign, segment, geography, or device
            and jump straight to the right admin surface to investigate it.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Starts" value={data.summary.totalStarts.toLocaleString()} />
        <StatCard label="Dimensions Covered" value={data.summary.dimensionsCovered} />
        <StatCard label="Critical Leaks" value={data.summary.criticalLeaks} />
        <StatCard label="Blindspots" value={data.summary.blindspots} />
        <StatCard label="Strongest Leak" value={data.summary.strongestLeak ?? "No data"} />
      </div>

      {data.trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {data.trust.warning}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-5">
        {DIMENSION_ORDER.map((key) => (
          <DimensionCard
            key={key}
            snapshot={data.dimensions[key]}
            isActive={activeDimension === key}
            onClick={() => startTransition(() => setActiveDimension(key))}
          />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {data.priorities.map((priority) => (
          <PriorityCard
            key={`${priority.dimension}-${priority.label}-${priority.leakStageLabel}`}
            dimensionLabel={data.dimensions[priority.dimension].label}
            item={priority}
          />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {data.trust.notes.map((note) => (
          <div
            key={note}
            className="rounded-xl border border-white/10 bg-surface p-4 text-sm text-text-muted"
          >
            {note}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-text-primary">{activeSnapshot.label}</h4>
            <p className="mt-1 text-sm text-text-muted">{activeSnapshot.description}</p>
          </div>
          <div className="text-right text-xs text-text-muted">
            <p>Strongest leak: {activeSnapshot.strongestLeak ?? "No data"}</p>
            {isPending && <p className="mt-1">Updating view...</p>}
          </div>
        </div>

        {activeSnapshot.trustNote && (
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
            {activeSnapshot.trustNote}
          </div>
        )}

        <div className="mt-5 space-y-4">
          {activeSnapshot.rows.length > 0 ? (
            activeSnapshot.rows.map((row) => <LeakRowCard key={row.key} row={row} />)
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-text-muted">
              No leakage rows are available for this dimension in the selected window.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
