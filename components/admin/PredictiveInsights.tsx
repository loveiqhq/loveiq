"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";

interface Insight {
  type: string;
  title: string;
  description: string;
  confidence: "high" | "medium" | "low";
  metric_value: number | null;
  comparison_value: number | null;
  trend: "up" | "down" | "stable";
  priority: number;
}

interface InsightsData {
  insights: Insight[];
  days: number;
}

const TYPE_LABELS: Record<string, string> = {
  volume_projection: "Volume Projection",
  abandonment_predictor: "Abandonment Predictor",
  utm_conversion: "UTM Conversion",
  archetype_trend: "Archetype Trend",
  friction_zone: "Friction Zone",
  completion_time: "Completion Time",
  revenue_forecast: "Revenue Forecast",
};

const CONFIDENCE_ORDER: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function formatMetric(value: number, type: string): string {
  if (type === "completion_time") {
    const totalSeconds = Math.round(value / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  }
  if (type === "utm_conversion" || type === "abandonment_predictor") {
    return `${value.toFixed(1)}%`;
  }
  if (type === "revenue_forecast") {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
    return `$${value}`;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function TypeIcon({ type }: { type: string }) {
  const cls = "h-5 w-5 shrink-0";

  if (type === "volume_projection") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    );
  }

  if (type === "abandonment_predictor") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18.5A1 1 0 002.69 20h18.62a1 1 0 00.87-1.5L13.71 3.86a1 1 0 00-1.42 0z"
        />
      </svg>
    );
  }

  if (type === "utm_conversion") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 4h18M6 8h12M9 12h6M11 16h2M12 20h.01"
        />
      </svg>
    );
  }

  if (type === "archetype_trend") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m4-4a4 4 0 100-8 4 4 0 000 8zm0 0v4"
        />
      </svg>
    );
  }

  if (type === "friction_zone") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
      </svg>
    );
  }

  if (type === "completion_time") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
      </svg>
    );
  }

  if (type === "revenue_forecast") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8c-2.21 0-4 .9-4 2s1.79 2 4 2 4 .9 4 2-1.79 2-4 2m0-8v1m0 10v1M8 10H6m12 0h-2M8 14H6m12 0h-2"
        />
      </svg>
    );
  }

  // Default fallback icon
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function TrendArrow({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") {
    return (
      <svg
        className="h-4 w-4 text-green-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  if (trend === "down") {
    return (
      <svg
        className="h-4 w-4 text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    );
  }
  return (
    <svg
      className="h-4 w-4 text-text-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  );
}

function confidenceCardClasses(confidence: "high" | "medium" | "low"): string {
  switch (confidence) {
    case "high":
      return "border border-purple-500/30 bg-purple-500/5 border-l-4 border-l-purple-500";
    case "medium":
      return "border border-orange-500/30 bg-orange-500/5 border-l-4 border-l-orange-500";
    case "low":
      return "border border-white/10 bg-white/5 border-l-4 border-l-white/20";
  }
}

function confidenceBadgeClasses(confidence: "high" | "medium" | "low"): string {
  switch (confidence) {
    case "high":
      return "bg-purple-500/20 text-purple-300";
    case "medium":
      return "bg-orange-500/20 text-orange-300";
    case "low":
      return "bg-white/10 text-text-muted";
  }
}

function confidenceIconColor(confidence: "high" | "medium" | "low"): string {
  switch (confidence) {
    case "high":
      return "text-purple-400";
    case "medium":
      return "text-orange-400";
    case "low":
      return "text-text-muted";
  }
}

function InsightCard({ insight }: { insight: Insight }) {
  const hasMetrics = insight.metric_value !== null && insight.comparison_value !== null;

  return (
    <div className={`rounded-xl p-5 space-y-2 ${confidenceCardClasses(insight.confidence)}`}>
      {/* Row 1: Icon + Title */}
      <div className={`flex items-center gap-2 ${confidenceIconColor(insight.confidence)}`}>
        <TypeIcon type={insight.type} />
        <p className="font-medium text-text-primary text-sm leading-snug">{insight.title}</p>
      </div>

      {/* Row 2: Description */}
      <p className="text-sm text-text-muted leading-relaxed">{insight.description}</p>

      {/* Row 3: Metric comparison */}
      {hasMetrics && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <TrendArrow trend={insight.trend} />
          <span className="text-sm font-semibold text-text-primary">
            {formatMetric(insight.metric_value as number, insight.type)}
          </span>
          <span className="text-xs text-text-muted">vs</span>
          <span className="text-sm text-text-muted">
            {formatMetric(insight.comparison_value as number, insight.type)}
          </span>
        </div>
      )}

      {/* Row 4: Confidence badge */}
      <div className="pt-0.5">
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${confidenceBadgeClasses(insight.confidence)}`}
        >
          {insight.confidence} confidence
        </span>
      </div>
    </div>
  );
}

function ConfidenceGroup({ label, insights }: { label: string; insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</h3>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {insights.map((insight, i) => (
          <InsightCard key={`${insight.type}-${i}`} insight={insight} />
        ))}
      </div>
    </div>
  );
}

export default function PredictiveInsights() {
  const [days, setDays] = useState(30);
  const [filterType, setFilterType] = useState("all");

  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<InsightsData>("/api/admin/predictions", params);

  const filtered = useMemo(() => {
    if (!data?.insights) return [];
    let list = data.insights;
    if (filterType !== "all") list = list.filter((i) => i.type === filterType);
    return [...list].sort(
      (a, b) =>
        a.priority - b.priority || CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]
    );
  }, [data, filterType]);

  const highConf = filtered.filter((i) => i.confidence === "high");
  const medConf = filtered.filter((i) => i.confidence === "medium");
  const lowConf = filtered.filter((i) => i.confidence === "low");

  const DAY_OPTIONS = [7, 14, 30, 90] as const;

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-bold text-text-primary">Predictive Insights</h2>

        <div className="flex flex-wrap items-center gap-3">
          {/* Day range pills */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  days === d
                    ? "bg-white/10 text-text-primary"
                    : "text-text-muted hover:bg-white/5 hover:text-text-primary"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Type filter dropdown */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-purple"
          >
            <option value="all">All types</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-xl bg-white/5 h-32" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-sm text-text-muted">
            No predictive insights available for the selected period. Try a longer time range or
            wait for more data to accumulate.
          </p>
        </div>
      )}

      {/* Insight groups */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-8">
          <ConfidenceGroup label="High Confidence" insights={highConf} />
          <ConfidenceGroup label="Medium Confidence" insights={medConf} />
          <ConfidenceGroup label="Low Confidence" insights={lowConf} />
        </div>
      )}
    </div>
  );
}
