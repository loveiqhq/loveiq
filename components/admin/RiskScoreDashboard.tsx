"use client";

import { useState } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";

interface SessionRisk {
  sessionId: string;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  factors: string[];
  currentIndex: number;
  totalEvents: number;
  backtracks: number;
  avgTimeMs: number;
  lastActivity: string;
  completed: boolean;
  abandoned: boolean;
}

interface RiskData {
  sessions: SessionRisk[];
  totalSessions: number;
  avgRiskScore: number;
  distribution: { critical: number; high: number; medium: number; low: number };
  fraudSummary: {
    reviewQueue: number;
    duplicateIpGroups: number;
    disposableEmails: number;
    duplicateAnswerPatterns: number;
  };
  fraudSignals: Array<{
    sessionId: string;
    submissionId: number | null;
    email: string | null;
    clientIp: string | null;
    fraudScore: number;
    reasons: string[];
    reviewState: string;
  }>;
}

const TABS = ["Overview", "Sessions", "Fraud"] as const;
type Tab = (typeof TABS)[number];

const riskColors: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-green-500/20 text-green-400",
};

export default function RiskScoreDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [filter, setFilter] = useState<string>("all");
  const { data, loading, error } = useAdminFetch<RiskData>("/api/admin/risk-score");

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
        {error || "Failed to load risk data."}
      </div>
    );
  }

  const filtered =
    filter === "all" ? data.sessions : data.sessions.filter((s) => s.riskLevel === filter);
  const maxDist = Math.max(
    data.distribution.critical,
    data.distribution.high,
    data.distribution.medium,
    data.distribution.low,
    1
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:bg-white/5 hover:text-text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Total Sessions
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{data.totalSessions}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Avg Risk Score
              </p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  data.avgRiskScore >= 45
                    ? "text-red-400"
                    : data.avgRiskScore >= 20
                      ? "text-yellow-400"
                      : "text-green-400"
                }`}
              >
                {data.avgRiskScore}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Critical/High
              </p>
              <p className="mt-1 text-2xl font-bold text-red-400">
                {data.distribution.critical + data.distribution.high}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Low Risk
              </p>
              <p className="mt-1 text-2xl font-bold text-green-400">{data.distribution.low}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-medium text-text-primary">Risk Distribution</h3>
            <div className="space-y-3">
              {(["critical", "high", "medium", "low"] as const).map((level) => (
                <div key={level} className="flex items-center gap-3">
                  <span className="w-16 text-sm capitalize text-text-muted">{level}</span>
                  <div className="h-8 flex-1 rounded bg-white/5">
                    <div
                      className={`flex h-full items-center rounded px-3 ${
                        level === "critical"
                          ? "bg-red-500/50"
                          : level === "high"
                            ? "bg-orange-500/50"
                            : level === "medium"
                              ? "bg-yellow-500/50"
                              : "bg-green-500/50"
                      }`}
                      style={{ width: `${(data.distribution[level] / maxDist) * 100}%` }}
                    >
                      <span className="text-xs font-medium text-text-primary">
                        {data.distribution[level]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-medium text-text-primary">
              Risk Factors (Top Sessions)
            </h3>
            <div className="space-y-3">
              {data.sessions
                .filter((s) => s.riskScore > 0 && s.factors.length > 0)
                .slice(0, 10)
                .map((s) => (
                  <div
                    key={s.sessionId}
                    className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/5 p-3"
                  >
                    <span
                      className={`mt-0.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${riskColors[s.riskLevel]}`}
                    >
                      {s.riskScore}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-mono text-text-primary">
                        {s.sessionId.slice(0, 12)}...
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {s.factors.map((f, i) => (
                          <li key={i} className="text-xs text-text-muted">
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Sessions" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {["all", "critical", "high", "medium", "low"].map((level) => (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filter === level
                    ? "bg-white/10 text-text-primary"
                    : "text-text-muted hover:bg-white/5"
                }`}
              >
                {level === "all" ? "All" : level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Events</th>
                  <th className="px-4 py-3">Backtracks</th>
                  <th className="px-4 py-3">Factors</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.sessionId} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">
                      {s.sessionId.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 font-bold text-text-primary">{s.riskScore}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${riskColors[s.riskLevel]}`}
                      >
                        {s.riskLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-muted">Q{s.currentIndex}</td>
                    <td className="px-4 py-3 text-text-muted">{s.totalEvents}</td>
                    <td className="px-4 py-3 text-text-muted">{s.backtracks}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-text-muted">
                      {s.factors.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "Fraud" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Review Queue
              </p>
              <p className="mt-1 text-2xl font-bold text-red-400">
                {data.fraudSummary.reviewQueue}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Duplicate IP Groups
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {data.fraudSummary.duplicateIpGroups}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Disposable Emails
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {data.fraudSummary.disposableEmails}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Duplicate Patterns
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {data.fraudSummary.duplicateAnswerPatterns}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {data.fraudSignals.map((signal) => (
              <div
                key={signal.sessionId}
                className="rounded-xl border border-white/10 bg-surface p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs uppercase tracking-wide text-red-300">
                        {signal.fraudScore}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide text-text-muted">
                        {signal.reviewState}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-text-primary">
                      Session {signal.sessionId.slice(0, 12)}...
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {signal.email ?? "No email"} · {signal.clientIp ?? "No IP"}
                    </p>
                  </div>
                  {signal.submissionId && (
                    <a
                      href={`/admin/submissions/${signal.submissionId}`}
                      className="text-xs text-accent-purple hover:underline"
                    >
                      Open submission
                    </a>
                  )}
                </div>
                <ul className="mt-4 space-y-2">
                  {signal.reasons.map((reason) => (
                    <li key={reason} className="text-sm text-text-muted">
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
