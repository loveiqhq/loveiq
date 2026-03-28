"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";

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
  frictionIndex: number;
  effectivenessScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  recommendation: string;
}

interface EffectivenessData {
  questions: Question[];
  avgScore: number;
  totalQuestions: number;
  totalSessions: number;
}

const TABS = ["Scorecard", "Details"] as const;
type Tab = (typeof TABS)[number];

const gradeColors: Record<string, string> = {
  A: "bg-green-500/20 text-green-400",
  B: "bg-green-500/15 text-green-300",
  C: "bg-yellow-500/20 text-yellow-400",
  D: "bg-orange-500/20 text-orange-400",
  F: "bg-red-500/20 text-red-400",
};

export default function QuestionEffectivenessDashboard() {
  const [days, setDays] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("Scorecard");
  const [sortKey, setSortKey] = useState<"effectivenessScore" | "qId">("effectivenessScore");
  const [sortAsc, setSortAsc] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
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
    if (typeof av === "string" && typeof bv === "string")
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });

  const goodCount = data.questions.filter((q) => q.grade === "A" || q.grade === "B").length;
  const badCount = data.questions.filter((q) => q.grade === "D" || q.grade === "F").length;

  function toggleSort(key: "effectivenessScore" | "qId") {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(key === "qId");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <TimeRangeSelector value={days} onChange={setDays} />
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

      {activeTab === "Scorecard" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Avg Effectiveness
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{data.avgScore}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Graded A/B
              </p>
              <p className="mt-1 text-2xl font-bold text-green-400">{goodCount}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Graded D/F
              </p>
              <p className="mt-1 text-2xl font-bold text-red-400">{badCount}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
                  <th
                    className="cursor-pointer px-4 py-3 hover:text-text-primary"
                    onClick={() => toggleSort("qId")}
                  >
                    Q ID {sortKey === "qId" && (sortAsc ? "↑" : "↓")}
                  </th>
                  <th className="px-4 py-3">Chapter</th>
                  <th
                    className="cursor-pointer px-4 py-3 hover:text-text-primary"
                    onClick={() => toggleSort("effectivenessScore")}
                  >
                    Score {sortKey === "effectivenessScore" && (sortAsc ? "↑" : "↓")}
                  </th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((q) => (
                  <tr key={q.qId} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 font-medium text-text-primary">{q.qId}</td>
                    <td className="px-4 py-3 text-text-muted">{q.chapterId}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-bold ${
                          q.effectivenessScore >= 65
                            ? "text-green-400"
                            : q.effectivenessScore >= 50
                              ? "text-yellow-400"
                              : "text-red-400"
                        }`}
                      >
                        {q.effectivenessScore}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${gradeColors[q.grade]}`}
                      >
                        {q.grade}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-text-muted">
                      {q.recommendation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "Details" && (
        <div className="space-y-2">
          {sorted.map((q) => (
            <div key={q.qId} className="rounded-xl border border-white/10 bg-surface">
              <button
                onClick={() => setExpanded(expanded === q.qId ? null : q.qId)}
                className="flex w-full items-center justify-between px-5 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${gradeColors[q.grade]}`}
                  >
                    {q.grade}
                  </span>
                  <span className="text-sm font-medium text-text-primary">{q.qId}</span>
                  <span className="max-w-md truncate text-xs text-text-muted">
                    {q.questionText}
                  </span>
                </div>
                <span className="text-sm font-bold text-text-primary">{q.effectivenessScore}</span>
              </button>
              {expanded === q.qId && (
                <div className="border-t border-white/10 px-5 py-4">
                  <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    {[
                      { label: "Completion", value: `${q.completionRate}%`, max: 100 },
                      { label: "Avg Time", value: `${q.avgActiveTimeS}s`, max: 60 },
                      { label: "Backtrack Rate", value: `${q.backtrackRate}%`, max: 100 },
                      { label: "Skip Rate", value: `${q.skipRate}%`, max: 100 },
                      { label: "Friction Index", value: q.frictionIndex.toFixed(1), max: 50 },
                    ].map((m) => (
                      <div key={m.label}>
                        <p className="text-xs text-text-muted">{m.label}</p>
                        <p className="mt-1 text-sm font-medium text-text-primary">{m.value}</p>
                        <div className="mt-1 h-1.5 rounded bg-white/10">
                          <div
                            className="h-full rounded bg-accent-purple/60"
                            style={{
                              width: `${Math.min((parseFloat(m.value) / m.max) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-text-muted">{q.recommendation}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
