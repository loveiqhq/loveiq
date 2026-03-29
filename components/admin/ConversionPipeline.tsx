"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import TimeRangeSelector from "./TimeRangeSelector";

interface PipelineStage {
  label: string;
  value: number;
}

interface ConversionRate {
  from: string;
  to: string;
  rate: number;
}

interface UtmRow {
  source: string;
  total: number;
  completed: number;
  conversionRate: number;
}

interface DailyEntry {
  date: string;
  waitlist: number;
  started: number;
  completed: number;
}

interface PipelineData {
  stages: PipelineStage[];
  conversionRates: ConversionRate[];
  avgTimeToComplete: number;
  medianTimeToComplete: number;
  utmSources: UtmRow[];
  dailyTrend: DailyEntry[];
}

function FunnelVisualization({ stages }: { stages: PipelineStage[] }) {
  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 font-serif text-base font-semibold text-text-primary">Pipeline Funnel</h3>
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const widthPct = Math.max(20, (stage.value / maxValue) * 100);
          const conversionToNext =
            i < stages.length - 1 && stage.value > 0
              ? Math.round((stages[i + 1].value / stage.value) * 100)
              : null;
          return (
            <div key={stage.label} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-text-muted">{stage.label}</span>
                  <span className="text-sm font-bold text-text-primary">
                    {stage.value.toLocaleString()}
                  </span>
                </div>
                <div className="h-8 rounded-lg bg-white/5" style={{ width: "100%" }}>
                  <div
                    className="flex h-8 items-center justify-end rounded-lg bg-accent-purple/60 pr-2"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
              {conversionToNext != null && (
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] text-text-muted">
                  {conversionToNext}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConversionCards({ rates }: { rates: ConversionRate[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rates.map((r) => (
        <div key={`${r.from}-${r.to}`} className="rounded-xl border border-white/10 bg-surface p-5">
          <p className="text-xs text-text-muted">
            {r.from} → {r.to}
          </p>
          <p className="mt-1 font-serif text-2xl font-bold text-text-primary">{r.rate}%</p>
        </div>
      ))}
    </div>
  );
}

function TimeToComplete({ avg, median }: { avg: number; median: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <p className="text-xs text-text-muted">Avg Time to Complete</p>
        <p className="mt-1 font-serif text-2xl font-bold text-text-primary">{avg.toFixed(1)}h</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <p className="text-xs text-text-muted">Median Time to Complete</p>
        <p className="mt-1 font-serif text-2xl font-bold text-text-primary">{median.toFixed(1)}h</p>
      </div>
    </div>
  );
}

function UtmSourceTable({ sources }: { sources: UtmRow[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 font-serif text-base font-semibold text-text-primary">By UTM Source</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-text-muted">
              <th className="pb-3 pr-4 font-medium">Source</th>
              <th className="pb-3 pr-4 font-medium">Total</th>
              <th className="pb-3 pr-4 font-medium">Completed</th>
              <th className="pb-3 font-medium">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((src, i) => (
              <tr
                key={src.source}
                className={`border-b border-white/5 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}
              >
                <td className="py-3 pr-4 font-medium text-text-primary">{src.source}</td>
                <td className="py-3 pr-4 text-text-muted">{src.total}</td>
                <td className="py-3 pr-4 text-text-muted">{src.completed}</td>
                <td className="py-3 text-text-muted">{src.conversionRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DailyTrend({ entries }: { entries: DailyEntry[] }) {
  if (entries.length === 0) return null;

  const maxVal = Math.max(...entries.map((e) => Math.max(e.waitlist, e.started, e.completed)), 1);

  const series = [
    { key: "waitlist" as const, label: "Waitlist", color: "#9c7dff" },
    { key: "started" as const, label: "Started", color: "#f26d4f" },
    { key: "completed" as const, label: "Completed", color: "#22c55e" },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 font-serif text-base font-semibold text-text-primary">
        Daily Funnel Trend
      </h3>
      <div className="grid gap-4 lg:grid-cols-3">
        {series.map((s) => (
          <div key={s.key}>
            <p className="mb-2 text-xs text-text-muted">{s.label}</p>
            <div className="space-y-1">
              {entries.slice(-14).map((entry) => {
                const val = entry[s.key] || 0;
                const pct = Math.max(4, (val / maxVal) * 100);
                return (
                  <div key={entry.date} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[10px] text-text-muted">
                      {entry.date.slice(5)}
                    </span>
                    <div className="flex-1">
                      <div className="h-4 w-full rounded bg-white/5">
                        <div
                          className="flex h-4 items-center justify-end rounded pr-1 text-[9px] font-semibold text-white"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: s.color,
                            opacity: 0.7,
                          }}
                        >
                          {val > 0 ? val : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-xs text-text-muted">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ConversionPipeline() {
  const [days, setDays] = useState(30);

  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<PipelineData>("/api/admin/pipeline", params);

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
        {error || "Failed to load pipeline data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">Waitlist-to-survey conversion funnel</p>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <FunnelVisualization stages={data.stages || []} />

      <div>
        <h3 className="mb-3 font-serif text-base font-semibold text-text-primary">
          Conversion Rates
        </h3>
        <ConversionCards rates={data.conversionRates || []} />
      </div>

      <div>
        <h3 className="mb-3 font-serif text-base font-semibold text-text-primary">
          Time to Complete
        </h3>
        <TimeToComplete avg={data.avgTimeToComplete || 0} median={data.medianTimeToComplete || 0} />
      </div>

      <UtmSourceTable sources={data.utmSources || []} />
      <DailyTrend entries={data.dailyTrend || []} />
    </div>
  );
}
