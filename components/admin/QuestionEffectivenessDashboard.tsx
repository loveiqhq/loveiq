"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";

interface ComparisonSnapshot {
  completionRate: number;
  avgActiveTimeS: number;
  backtrackRate: number;
  skipRate: number;
  avgRevisions: number;
}

interface ComparisonDeltas {
  completionRate: number;
  avgActiveTimeS: number;
  backtrackRate: number;
  skipRate: number;
  avgRevisions: number;
}

interface Question {
  qId: string;
  chapterId: string;
  questionText: string;
  reachN: number;
  dropoffN: number;
  completionRate: number;
  avgActiveTimeS: number;
  backtrackN: number;
  backtrackRate: number;
  skipRate: number;
  avgRevisions: number;
  frictionIndex: number;
  effectivenessScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  recommendation: string;
  confidence: "high" | "medium" | "low";
  regressionScore: number;
  watchStatus: "regressed" | "stable" | "improved";
  comparisonWindowDays: number;
  comparisonBaseline: ComparisonSnapshot;
  comparisonDeltas: ComparisonDeltas;
  regressionReasons: string[];
}

interface EffectivenessData {
  questions: Question[];
  watchlist: Question[];
  dropoffDeepView: {
    contextCoverage: {
      source: boolean;
      embed: boolean;
      browser: boolean;
      device: boolean;
    };
    trust: {
      source: string;
      mode: string;
      sampleSize: number;
      warning: string | null;
    };
    questions: Array<{
      qId: string;
      chapterId: string;
      questionText: string;
      reachN: number;
      dropoffN: number;
      dropoffRate: number;
      medianDwellS: number | null;
      bounceAfterQuestionRate: number;
      sourceSplit: Array<{ label: string; count: number }>;
      embedSplit: Array<{ label: string; count: number }>;
      deviceSplit: Array<{ label: string; count: number }>;
      browserSplit: Array<{ label: string; count: number }>;
      trustNote: string | null;
    }>;
  };
  avgScore: number;
  totalQuestions: number;
  totalSessions: number;
  summary: {
    regressedCount: number;
    improvedCount: number;
    lowConfidenceCount: number;
    comparisonWindowDays: number;
  };
}

const TABS = ["Regression Watchlist", "Scorecard", "Details", "Drop-off Deep View"] as const;
type Tab = (typeof TABS)[number];

const gradeColors: Record<string, string> = {
  A: "bg-green-500/20 text-green-400",
  B: "bg-green-500/15 text-green-300",
  C: "bg-yellow-500/20 text-yellow-400",
  D: "bg-orange-500/20 text-orange-400",
  F: "bg-red-500/20 text-red-400",
};

const confidenceColors: Record<string, string> = {
  high: "bg-emerald-500/20 text-emerald-300",
  medium: "bg-amber-500/20 text-amber-300",
  low: "bg-white/10 text-text-muted",
};

const watchStatusColors: Record<string, string> = {
  regressed: "bg-red-500/20 text-red-300",
  stable: "bg-white/10 text-text-muted",
  improved: "bg-emerald-500/20 text-emerald-300",
};
const questionRangeOptions = [
  { days: 7, label: "7d", ariaLabel: "Last 7 days" },
  { days: 30, label: "30d", ariaLabel: "Last 30 days" },
  { days: 90, label: "90d", ariaLabel: "Last 90 days" },
] as const;

function deltaClasses(value: number, invert = false) {
  if (value === 0) return "text-text-muted";
  const isGood = invert ? value < 0 : value > 0;
  return isGood ? "text-red-300" : "text-emerald-300";
}

function formatDelta(value: number, suffix: string) {
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

export default function QuestionEffectivenessDashboard() {
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<Tab>("Regression Watchlist");
  const [sortKey, setSortKey] = useState<"effectivenessScore" | "qId" | "regressionScore">(
    "regressionScore"
  );
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<EffectivenessData>(
    "/api/admin/question-effectiveness",
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
        {error || "Failed to load data."}
      </div>
    );
  }

  const sorted = [...data.questions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });

  const goodCount = data.questions.filter((q) => q.grade === "A" || q.grade === "B").length;
  const badCount = data.questions.filter((q) => q.grade === "D" || q.grade === "F").length;

  function toggleSort(key: "effectivenessScore" | "qId" | "regressionScore") {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(key === "qId");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <TimeRangeSelector value={days} onChange={setDays} options={questionRangeOptions} />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Regression Watch</h2>
            <p className="mt-1 text-xs text-text-muted">
              Last {data.summary.comparisonWindowDays} days compared against the all-time baseline
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-text-muted">
            {data.totalSessions.toLocaleString()} sessions in range
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Avg Effectiveness
            </p>
            <p className="mt-1 text-2xl font-bold text-text-primary">{data.avgScore}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Regressed
            </p>
            <p className="mt-1 text-2xl font-bold text-red-300">{data.summary.regressedCount}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Improved</p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">{data.summary.improvedCount}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Low Confidence
            </p>
            <p className="mt-1 text-2xl font-bold text-text-primary">
              {data.summary.lowConfidenceCount}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Graded A/B
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">{goodCount}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Graded D/F
            </p>
            <p className="mt-1 text-2xl font-bold text-red-300">{badCount}</p>
          </div>
        </div>
      </div>

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

      {activeTab === "Regression Watchlist" && (
        <div className="space-y-3">
          {data.watchlist.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-surface p-6 text-center text-sm text-text-muted">
              No regressed questions detected in the selected window.
            </div>
          )}

          {data.watchlist.map((question) => (
            <div key={question.qId} className="rounded-xl border border-white/10 bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${watchStatusColors[question.watchStatus]}`}
                    >
                      {question.watchStatus}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceColors[question.confidence]}`}
                    >
                      {question.confidence} confidence
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-text-muted">
                      {question.qId}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-text-primary">
                    {question.questionText}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Chapter {question.chapterId} · reach {question.reachN}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Regression</p>
                  <p className="mt-1 text-2xl font-bold text-red-300">
                    {question.regressionScore.toFixed(1)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-text-muted">Completion</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {question.completionRate}%
                  </p>
                  <p
                    className={`mt-1 text-xs ${deltaClasses(question.comparisonDeltas.completionRate, true)}`}
                  >
                    {formatDelta(question.comparisonDeltas.completionRate, "pp")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-text-muted">Avg Time</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {question.avgActiveTimeS}s
                  </p>
                  <p
                    className={`mt-1 text-xs ${deltaClasses(question.comparisonDeltas.avgActiveTimeS)}`}
                  >
                    {formatDelta(question.comparisonDeltas.avgActiveTimeS, "s")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-text-muted">Backtrack</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {question.backtrackRate}%
                  </p>
                  <p
                    className={`mt-1 text-xs ${deltaClasses(question.comparisonDeltas.backtrackRate)}`}
                  >
                    {formatDelta(question.comparisonDeltas.backtrackRate, "pp")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-text-muted">Skip Rate</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">{question.skipRate}%</p>
                  <p className={`mt-1 text-xs ${deltaClasses(question.comparisonDeltas.skipRate)}`}>
                    {formatDelta(question.comparisonDeltas.skipRate, "pp")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-text-muted">Avg Revisions</p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {question.avgRevisions}
                  </p>
                  <p
                    className={`mt-1 text-xs ${deltaClasses(question.comparisonDeltas.avgRevisions)}`}
                  >
                    {formatDelta(question.comparisonDeltas.avgRevisions, "")}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {question.regressionReasons.map((reason) => (
                  <p key={reason} className="text-sm text-text-muted">
                    {reason}
                  </p>
                ))}
                <p className="text-sm text-text-primary">{question.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Scorecard" && (
        <div className="rounded-xl overflow-x-auto border border-white/10 bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
                <th
                  className="cursor-pointer px-4 py-3 hover:text-text-primary"
                  onClick={() => toggleSort("qId")}
                >
                  Q ID {sortKey === "qId" && (sortAsc ? "↑" : "↓")}
                </th>
                <th className="px-4 py-3">Status</th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-text-primary"
                  onClick={() => toggleSort("effectivenessScore")}
                >
                  Score {sortKey === "effectivenessScore" && (sortAsc ? "↑" : "↓")}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-text-primary"
                  onClick={() => toggleSort("regressionScore")}
                >
                  Regression {sortKey === "regressionScore" && (sortAsc ? "↑" : "↓")}
                </th>
                <th className="px-4 py-3">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((question) => (
                <tr key={question.qId} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-text-primary">{question.qId}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${gradeColors[question.grade]}`}
                      >
                        {question.grade}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${watchStatusColors[question.watchStatus]}`}
                      >
                        {question.watchStatus}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-bold ${
                        question.effectivenessScore >= 65
                          ? "text-green-400"
                          : question.effectivenessScore >= 50
                            ? "text-yellow-400"
                            : "text-red-400"
                      }`}
                    >
                      {question.effectivenessScore}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-red-300">{question.regressionScore.toFixed(1)}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-text-muted">
                    {question.recommendation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "Details" && (
        <div className="space-y-2">
          {sorted.map((question) => (
            <div key={question.qId} className="rounded-xl border border-white/10 bg-surface">
              <button
                onClick={() => setExpanded(expanded === question.qId ? null : question.qId)}
                className="flex w-full items-center justify-between px-5 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${gradeColors[question.grade]}`}
                  >
                    {question.grade}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${watchStatusColors[question.watchStatus]}`}
                  >
                    {question.watchStatus}
                  </span>
                  <span className="text-sm font-medium text-text-primary">{question.qId}</span>
                  <span className="max-w-md truncate text-xs text-text-muted">
                    {question.questionText}
                  </span>
                </div>
                <span className="text-sm font-bold text-text-primary">
                  {question.effectivenessScore}
                </span>
              </button>
              {expanded === question.qId && (
                <div className="border-t border-white/10 px-5 py-4">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      {
                        label: "Completion",
                        current: `${question.completionRate}%`,
                        baseline: `${question.comparisonBaseline.completionRate}%`,
                        delta: formatDelta(question.comparisonDeltas.completionRate, "pp"),
                        deltaClass: deltaClasses(question.comparisonDeltas.completionRate, true),
                      },
                      {
                        label: "Avg Time",
                        current: `${question.avgActiveTimeS}s`,
                        baseline: `${question.comparisonBaseline.avgActiveTimeS}s`,
                        delta: formatDelta(question.comparisonDeltas.avgActiveTimeS, "s"),
                        deltaClass: deltaClasses(question.comparisonDeltas.avgActiveTimeS),
                      },
                      {
                        label: "Backtrack",
                        current: `${question.backtrackRate}%`,
                        baseline: `${question.comparisonBaseline.backtrackRate}%`,
                        delta: formatDelta(question.comparisonDeltas.backtrackRate, "pp"),
                        deltaClass: deltaClasses(question.comparisonDeltas.backtrackRate),
                      },
                      {
                        label: "Skip Rate",
                        current: `${question.skipRate}%`,
                        baseline: `${question.comparisonBaseline.skipRate}%`,
                        delta: formatDelta(question.comparisonDeltas.skipRate, "pp"),
                        deltaClass: deltaClasses(question.comparisonDeltas.skipRate),
                      },
                      {
                        label: "Avg Revisions",
                        current: `${question.avgRevisions}`,
                        baseline: `${question.comparisonBaseline.avgRevisions}`,
                        delta: formatDelta(question.comparisonDeltas.avgRevisions, ""),
                        deltaClass: deltaClasses(question.comparisonDeltas.avgRevisions),
                      },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-lg border border-white/10 bg-white/5 p-4"
                      >
                        <p className="text-xs text-text-muted">{metric.label}</p>
                        <p className="mt-1 text-sm font-medium text-text-primary">
                          {metric.current}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">Baseline {metric.baseline}</p>
                        <p className={`mt-1 text-xs ${metric.deltaClass}`}>{metric.delta}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {question.regressionReasons.map((reason) => (
                      <p key={reason} className="text-sm text-text-muted">
                        {reason}
                      </p>
                    ))}
                    <p className="text-sm text-text-primary">{question.recommendation}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === "Drop-off Deep View" && (
        <div className="space-y-6">
          {data.dropoffDeepView.trust.warning && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
              {data.dropoffDeepView.trust.warning}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Context Source
              </p>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                {data.dropoffDeepView.trust.source}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Context Rows
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                {data.dropoffDeepView.trust.sampleSize}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Device Coverage
              </p>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                {data.dropoffDeepView.contextCoverage.device ? "Captured" : "Missing"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Browser Coverage
              </p>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                {data.dropoffDeepView.contextCoverage.browser ? "Captured" : "Missing"}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {data.dropoffDeepView.questions.map((question) => (
              <div key={question.qId} className="rounded-xl border border-white/10 bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-text-muted">
                        {question.qId}
                      </span>
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
                        {question.dropoffRate}% drop-off
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-text-primary">
                      {question.questionText}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Chapter {question.chapterId} · reach {question.reachN} · drop-offs{" "}
                      {question.dropoffN}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-text-muted">Median dwell</p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">
                      {question.medianDwellS != null ? `${question.medianDwellS}s` : "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                      Top Sources
                    </p>
                    <div className="mt-3 space-y-2">
                      {question.sourceSplit.length === 0 && (
                        <p className="text-sm text-text-muted">No source context available.</p>
                      )}
                      {question.sourceSplit.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-text-primary">{item.label}</span>
                          <span className="text-xs text-text-muted">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                      Placement Split
                    </p>
                    <div className="mt-3 space-y-2">
                      {question.embedSplit.length === 0 && (
                        <p className="text-sm text-text-muted">No placement markers yet.</p>
                      )}
                      {question.embedSplit.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-text-primary">{item.label}</span>
                          <span className="text-xs text-text-muted">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                      Instrumentation Gaps
                    </p>
                    <p className="mt-3 text-sm text-text-muted">{question.trustNote}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
