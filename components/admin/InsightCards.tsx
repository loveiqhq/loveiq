"use client";

import { useMemo } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";

interface Insight {
  type: string;
  severity: string;
  title: string;
  description: string;
  metric?: string;
}

interface InsightsResponse {
  insights: Insight[];
  period: number;
}

function severityClasses(severity: string): string {
  switch (severity) {
    case "positive":
      return "border-emerald-500/20 bg-emerald-500/5";
    case "warning":
      return "border-amber-500/20 bg-amber-500/5";
    case "info":
      return "border-blue-500/20 bg-blue-500/5";
    default:
      return "border-white/10 bg-white/5";
  }
}

function metricColor(severity: string): string {
  switch (severity) {
    case "positive":
      return "text-emerald-400";
    case "warning":
      return "text-amber-400";
    case "info":
      return "text-blue-400";
    default:
      return "text-text-muted";
  }
}

function InsightIcon({ type, severity }: { type: string; severity: string }) {
  const color = metricColor(severity);

  if (type === "anomaly") {
    return (
      <svg
        className={`h-5 w-5 ${color}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01M10.29 3.86l-8.6 14.86A1 1 0 002.56 20h18.88a1 1 0 00.87-1.28l-8.6-14.86a1 1 0 00-1.42 0z"
        />
      </svg>
    );
  }

  if (type === "trend") {
    return (
      <svg
        className={`h-5 w-5 ${color}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    );
  }

  return (
    <svg
      className={`h-5 w-5 ${color}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export default function InsightCards({ days }: { days: number }) {
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<InsightsResponse>("/api/admin/insights", params);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Automated Insights</h3>
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Automated Insights</h3>
        <p className="py-4 text-center text-xs text-text-muted">
          {error || "Unable to load insights"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Automated Insights</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.insights.map((insight, i) => (
          <div key={i} className={`rounded-lg border p-4 ${severityClasses(insight.severity)}`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                <InsightIcon type={insight.type} severity={insight.severity} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">{insight.title}</p>
                <p className="mt-1 text-xs text-text-muted">{insight.description}</p>
              </div>
              {insight.metric && (
                <span
                  className={`ml-auto shrink-0 text-sm font-bold ${metricColor(insight.severity)}`}
                >
                  {insight.metric}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
