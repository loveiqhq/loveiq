"use client";

import { useMemo, useState } from "react";
import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface DeltaItem {
  dimension: "source" | "archetype" | "status";
  key: string;
  currentCount: number;
  previousCount: number;
  currentShare: number;
  previousShare: number;
  deltaShare: number;
  direction: "up" | "down" | "flat";
  confidence: "high" | "medium" | "low";
}

interface DeltaData {
  summary: {
    windowDays: number;
    currentTotal: number;
    previousTotal: number;
    biggestRiser: string | null;
    biggestFaller: string | null;
  };
  watchlist: DeltaItem[];
  trust: {
    sampleSize: number;
    warning: string | null;
  };
}

const dimensionLabels: Record<DeltaItem["dimension"], string> = {
  source: "Source",
  archetype: "Archetype",
  status: "Status",
};

function deltaClass(deltaShare: number): string {
  if (deltaShare > 0) return "text-emerald-300";
  if (deltaShare < 0) return "text-red-300";
  return "text-text-muted";
}

export default function SegmentDeltaMonitor() {
  const [days, setDays] = useState(30);
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<DeltaData>("/api/admin/segments/deltas", params);

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-surface p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="font-serif text-lg text-text-primary">Segment Delta Monitor</h3>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Tracks which archetypes, sources, and statuses are gaining or losing share versus the
            previous matching window.
          </p>
        </div>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Current Window
              </p>
              <p className="mt-2 text-2xl font-bold text-text-primary">
                {data.summary.currentTotal}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Previous Window
              </p>
              <p className="mt-2 text-2xl font-bold text-text-primary">
                {data.summary.previousTotal}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-300">
                Biggest Riser
              </p>
              <p className="mt-2 text-sm font-semibold text-text-primary">
                {data.summary.biggestRiser ?? "No material riser"}
              </p>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-red-300">
                Biggest Faller
              </p>
              <p className="mt-2 text-sm font-semibold text-text-primary">
                {data.summary.biggestFaller ?? "No material faller"}
              </p>
            </div>
          </div>

          {data.trust.warning && (
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-300">
              {data.trust.warning}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Dimension</th>
                  <th className="px-4 py-3 font-medium">Segment</th>
                  <th className="px-4 py-3 font-medium">Current</th>
                  <th className="px-4 py-3 font-medium">Previous</th>
                  <th className="px-4 py-3 font-medium">Share Delta</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {data.watchlist.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                      No material segment movement detected for this window.
                    </td>
                  </tr>
                )}
                {data.watchlist.map((item) => (
                  <tr key={`${item.dimension}-${item.key}`} className="border-t border-white/5">
                    <td className="px-4 py-3 text-text-muted">{dimensionLabels[item.dimension]}</td>
                    <td className="px-4 py-3 text-text-primary">{item.key}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {item.currentCount} ({item.currentShare}%)
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {item.previousCount} ({item.previousShare}%)
                    </td>
                    <td className={`px-4 py-3 font-medium ${deltaClass(item.deltaShare)}`}>
                      {item.deltaShare > 0 ? "+" : ""}
                      {item.deltaShare} pts
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs uppercase text-text-muted">
                        {item.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
