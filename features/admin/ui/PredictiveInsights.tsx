"use client";

import { startTransition, useMemo, useState } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";

type Confidence = "high" | "medium" | "low";
type Trend = "up" | "down" | "stable";
type ForecastUnit = "count" | "percent" | "currency";

interface ForecastModule {
  key: string;
  label: string;
  description: string;
  unit: ForecastUnit;
  currentValue: number;
  previousValue: number;
  forecastValue: number;
  lowerBound: number;
  upperBound: number;
  deltaPct: number;
  actualVsForecastPct: number | null;
  confidence: Confidence;
  trend: Trend;
  href: string;
  series: Array<{ date: string; actual: number }>;
  drilldowns: Array<{ label: string; value: string; href: string }>;
}

interface ForecastArchetypeMix {
  archetype: string;
  currentShare: number;
  previousShare: number;
  projectedShare: number;
  deltaShare: number;
  confidence: Confidence;
  href: string;
}

interface Insight {
  type: string;
  title: string;
  description: string;
  confidence: Confidence;
  metric_value: number | null;
  comparison_value: number | null;
  trend: Trend;
  priority: number;
}

interface ForecastData {
  days: number;
  forecastHorizonDays: number;
  generatedAt: string;
  modules: ForecastModule[];
  mixForecasts: ForecastArchetypeMix[];
  insights: Insight[];
}

const CONFIDENCE_ORDER: Record<Confidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const confidenceClasses: Record<Confidence, string> = {
  high: "bg-emerald-500/10 text-emerald-300",
  medium: "bg-amber-500/10 text-amber-200",
  low: "bg-white/10 text-text-muted",
};

const trendColor = (trend: Trend) =>
  trend === "up" ? "text-emerald-300" : trend === "down" ? "text-red-300" : "text-text-muted";

function formatValue(value: number, unit: ForecastUnit) {
  if (unit === "percent") return `${value}%`;
  if (unit === "currency") {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  }
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(unit === "count" ? 0 : 1);
}

function signed(value: number, suffix = "%") {
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

export default function PredictiveInsights() {
  const [days, setDays] = useState(30);
  const [confidenceFilter, setConfidenceFilter] = useState<Confidence | "all">("all");
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<ForecastData>("/api/admin/predictions", params);

  const filteredInsights = useMemo(() => {
    const insights = data?.insights ?? [];
    return [...insights]
      .filter((insight) => confidenceFilter === "all" || insight.confidence === confidenceFilter)
      .sort(
        (a, b) =>
          a.priority - b.priority || CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]
      );
  }, [confidenceFilter, data]);

  const DAY_OPTIONS = [14, 30, 60, 90] as const;

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
        {error || "Failed to load forecasting data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold text-text-primary">Forecasting & Insights</h2>
          <p className="mt-1 text-sm text-text-muted">
            Reusable forecast modules, actual-vs-forecast accuracy, archetype mix shifts, and ranked
            predictive insights.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => startTransition(() => setDays(option))}
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  days === option
                    ? "bg-white/10 text-text-primary"
                    : "text-text-muted hover:bg-white/5 hover:text-text-primary"
                }`}
              >
                {option}d
              </button>
            ))}
          </div>
          <select
            value={confidenceFilter}
            onChange={(event) =>
              startTransition(() => setConfidenceFilter(event.target.value as Confidence | "all"))
            }
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary focus:border-white/20 focus:outline-none"
          >
            <option value="all">All confidence</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Forecast Modules</h3>
            <p className="mt-1 text-xs text-text-muted">
              Predicting the next {data.forecastHorizonDays} days from the last {data.days} days.
            </p>
          </div>
          <p className="text-xs text-text-muted">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.modules.map((module) => (
            <a
              key={module.key}
              href={module.href}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary">{module.label}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${confidenceClasses[module.confidence]}`}
                    >
                      {module.confidence}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text-muted">{module.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Next window</p>
                  <p className="mt-1 text-2xl font-bold text-text-primary">
                    {formatValue(module.forecastValue, module.unit)}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatValue(module.lowerBound, module.unit)} -{" "}
                    {formatValue(module.upperBound, module.unit)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <ForecastStat
                  label="Current"
                  value={formatValue(module.currentValue, module.unit)}
                  detail={signed(module.deltaPct, module.unit === "percent" ? "pp" : "%")}
                  tone={module.trend}
                />
                <ForecastStat
                  label="Previous"
                  value={formatValue(module.previousValue, module.unit)}
                  detail="Last window"
                  tone="stable"
                />
                <ForecastStat
                  label="Accuracy"
                  value={
                    module.actualVsForecastPct == null
                      ? "n/a"
                      : signed(module.actualVsForecastPct, "%")
                  }
                  detail="Actual vs forecast"
                  tone={
                    module.actualVsForecastPct == null
                      ? "stable"
                      : module.actualVsForecastPct >= 0
                        ? "up"
                        : "down"
                  }
                />
              </div>
              <div className="mt-4 flex h-16 items-end gap-1">
                {module.series.map((point) => {
                  const max = Math.max(...module.series.map((item) => item.actual), 1);
                  return (
                    <div
                      key={point.date}
                      className="flex-1 rounded-t bg-cyan-400/30"
                      style={{ height: `${Math.max(8, (point.actual / max) * 100)}%` }}
                    />
                  );
                })}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {module.drilldowns.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-white/10 bg-surface px-3 py-3"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-text-muted">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm text-text-primary">{item.value}</p>
                  </div>
                ))}
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary">Ranked Predictive Insights</h3>
          <div className="mt-4 space-y-3">
            {filteredInsights.map((insight) => (
              <div
                key={`${insight.type}-${insight.title}`}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${confidenceClasses[insight.confidence]}`}
                      >
                        {insight.confidence}
                      </span>
                      <p className="text-sm font-semibold text-text-primary">{insight.title}</p>
                    </div>
                    <p className="mt-2 text-sm text-text-muted">{insight.description}</p>
                  </div>
                  <div className={`text-sm font-semibold ${trendColor(insight.trend)}`}>
                    {insight.metric_value != null && insight.comparison_value != null
                      ? `${insight.metric_value} vs ${insight.comparison_value}`
                      : insight.trend}
                  </div>
                </div>
              </div>
            ))}
            {filteredInsights.length === 0 && (
              <p className="text-sm text-text-muted">No insight cards match the current filter.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary">Archetype Mix Projection</h3>
          <div className="mt-4 space-y-3">
            {data.mixForecasts.map((item) => (
              <a
                key={item.archetype}
                href={item.href}
                className="block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">{item.archetype}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${confidenceClasses[item.confidence]}`}
                      >
                        {item.confidence}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      now {item.currentShare}% • previous {item.previousShare}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-text-primary">
                      {item.projectedShare}%
                    </p>
                    <p
                      className={`text-xs ${item.deltaShare >= 0 ? "text-emerald-300" : "text-red-300"}`}
                    >
                      {signed(item.deltaShare, "pp")}
                    </p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ForecastStat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: Trend;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary">{value}</p>
      <p className={`mt-1 text-xs ${trendColor(tone)}`}>{detail}</p>
    </div>
  );
}
