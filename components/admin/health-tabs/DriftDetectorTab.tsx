"use client";

import { useState } from "react";
import AdminReviewRequestButton from "@/components/admin/AdminReviewRequestButton";
import StatCard from "@/components/admin/StatCard";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import type { DriftDetectorSnapshot } from "@/lib/admin/drift-detector";

function categoryTone(status: "stable" | "watch" | "risk") {
  if (status === "risk") return "bg-red-500/10 text-red-300";
  if (status === "watch") return "bg-amber-500/10 text-amber-200";
  return "bg-emerald-500/10 text-emerald-300";
}

function severityTone(value: "risk" | "watch") {
  return value === "risk" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-200";
}

function reviewDateForSeverity(severity: "risk" | "watch") {
  const days = severity === "risk" ? 7 : 14;
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export default function DriftDetectorTab() {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useAdminFetch<DriftDetectorSnapshot>(
    "/api/admin/drift-detector",
    { days: String(days) }
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
        {error || "Failed to load drift detector."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Drift Detector</h3>
          <p className="mt-1 text-xs text-text-muted">
            Detect taxonomy, event naming, config, answer-mapping, and experiment setup drift before
            it becomes a silent reporting or release bug.
          </p>
        </div>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Findings" value={String(data.summary.totalFindings)} />
        <StatCard label="Risk" value={String(data.summary.riskFindings)} />
        <StatCard label="Watch" value={String(data.summary.watchFindings)} />
        <StatCard
          label="Categories"
          value={String(data.summary.categoriesAtRisk)}
          sub="with active drift"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Questions Impacted" value={String(data.summary.impactedQuestions)} />
        <StatCard label="Experiments Impacted" value={String(data.summary.impactedExperiments)} />
        <StatCard label="Uncovered Terms" value={String(data.summary.uncoveredTerms)} />
        <StatCard label="Unexpected Events" value={String(data.summary.unexpectedEventTypes)} />
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-text-primary">Surface Health</h4>
            <p className="mt-1 text-xs text-text-muted">
              One card per drift class, with current coverage and risk posture.
            </p>
          </div>
          <p className="text-xs text-text-muted">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.categorySummaries.map((summary) => (
            <div key={summary.key} className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${categoryTone(summary.status)}`}
                    >
                      {summary.status}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                      {summary.findingCount} finding{summary.findingCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-text-primary">{summary.label}</p>
                  <p className="mt-2 text-sm text-text-muted">{summary.note}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-right">
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">Risk score</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {summary.riskScore}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-white/10 bg-black/10 px-3 py-3 text-sm text-text-muted">
                {summary.coverageLabel}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-text-primary">Active Findings</h4>
            <p className="mt-1 text-xs text-text-muted">
              Sorted by severity and blast radius so the highest-leverage fixes stay on top.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {data.findings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
              No active drift findings in the selected window.
            </div>
          ) : (
            data.findings.map((finding) => (
              <div key={finding.id} className="rounded-2xl border border-white/10 bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${severityTone(finding.severity)}`}
                      >
                        {finding.severity}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {finding.categoryLabel}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                        {finding.affectedCount} affected
                      </span>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-text-primary">{finding.title}</p>
                    <p className="mt-2 text-sm text-text-muted">{finding.detail}</p>
                  </div>
                  <a
                    href={finding.href}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                  >
                    Open source
                  </a>
                </div>

                {finding.signals.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {finding.signals.map((signal) => (
                      <span
                        key={`${finding.id}-${signal}`}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted"
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-white/10 bg-black/10 px-3 py-3 text-sm text-text-primary">
                  {finding.recommendation}
                </div>
                <div className="mt-4">
                  <AdminReviewRequestButton
                    title={`Review drift finding: ${finding.title}`}
                    description={finding.detail}
                    resourceType="general"
                    impactLevel={finding.severity === "risk" ? "high" : "medium"}
                    sourceHref="/admin/health?tab=Drift%20Detector"
                    dueDate={reviewDateForSeverity(finding.severity)}
                    payloadSnapshot={{
                      findingId: finding.id,
                      categoryLabel: finding.categoryLabel,
                      severity: finding.severity,
                      affectedCount: finding.affectedCount,
                      signals: finding.signals,
                    }}
                    label="Request review"
                    busyLabel="Requesting..."
                    successLabel="Queued"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:bg-white/10 disabled:opacity-40"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
