"use client";

import { useMemo } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";

type Severity = "critical" | "warning" | "positive" | "info" | "neutral";
type Confidence = "high" | "medium" | "low";

interface Insight {
  id: string;
  type: "triage" | "trend" | "opportunity" | "trust";
  severity: Severity;
  title: string;
  description: string;
  metric?: string;
  category: string;
  priority: number;
  confidence: Confidence;
  sampleSize?: number;
  href?: string;
  actionLabel?: string;
}

interface InsightsResponse {
  insights: Insight[];
  summary: {
    attentionCount: number;
    opportunityCount: number;
    trustCount: number;
  };
  period: number;
  sampleSize: number;
}

function severityClasses(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "border-red-500/20 bg-red-500/5";
    case "warning":
      return "border-amber-500/20 bg-amber-500/5";
    case "positive":
      return "border-emerald-500/20 bg-emerald-500/5";
    case "info":
      return "border-blue-500/20 bg-blue-500/5";
    default:
      return "border-white/10 bg-white/5";
  }
}

function metricColor(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "text-red-400";
    case "warning":
      return "text-amber-400";
    case "positive":
      return "text-emerald-400";
    case "info":
      return "text-blue-400";
    default:
      return "text-text-muted";
  }
}

function confidenceClasses(confidence: Confidence): string {
  switch (confidence) {
    case "high":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "medium":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    default:
      return "border-white/10 bg-white/5 text-text-muted";
  }
}

function categoryLabel(category: string) {
  return category.replace(/-/g, " ");
}

function InsightIcon({ type, severity }: { type: Insight["type"]; severity: Severity }) {
  const color = metricColor(severity);

  if (type === "triage") {
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

  if (type === "opportunity") {
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

  if (type === "trust") {
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
          d="M9 12l2 2 4-4m5.586-4.414A2 2 0 0018.172 4H5.828a2 2 0 00-1.414.586A2 2 0 004 6v12a2 2 0 00.586 1.414A2 2 0 005.828 20h12.344a2 2 0 001.414-.586A2 2 0 0020 18V6a2 2 0 00-.586-1.414z"
        />
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
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Triage Queue</h3>
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Triage Queue</h3>
        <p className="py-4 text-center text-xs text-text-muted">
          {error || "Unable to load insights"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Triage Queue</h3>
          <p className="mt-1 text-xs text-text-muted">
            Last {data.period} days · {data.sampleSize.toLocaleString()} submissions analyzed
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[11px] font-medium text-red-300">
            {data.summary.attentionCount} attention
          </span>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300">
            {data.summary.opportunityCount} opportunities
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-text-muted">
            {data.summary.trustCount} trust notes
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {data.insights.map((insight) => (
          <div
            key={insight.id}
            className={`rounded-lg border p-4 ${severityClasses(insight.severity)}`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                <InsightIcon type={insight.type} severity={insight.severity} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    P{insight.priority}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    {categoryLabel(insight.category)}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${confidenceClasses(
                      insight.confidence
                    )}`}
                  >
                    {insight.confidence}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-text-primary">{insight.title}</p>
                <p className="mt-1 text-xs leading-5 text-text-muted">{insight.description}</p>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                  {insight.metric && (
                    <span className={`font-semibold ${metricColor(insight.severity)}`}>
                      {insight.metric}
                    </span>
                  )}
                  {insight.sampleSize != null && <span>n={insight.sampleSize}</span>}
                </div>
              </div>
            </div>

            {insight.href && insight.actionLabel && (
              <div className="mt-4">
                <a
                  href={insight.href}
                  className="inline-flex items-center gap-1 text-xs font-medium text-text-primary transition hover:text-white"
                >
                  {insight.actionLabel}
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
