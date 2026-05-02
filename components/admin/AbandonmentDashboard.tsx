"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";

interface PartialSave {
  id: number;
  sessionId: string;
  currentIndex: number;
  startedAt: string;
  savedAt: string;
  utmTracker: string | null;
  answersCount: number;
  durationMin: number;
}

interface KillQuestion {
  qId: string;
  abandonCount: number;
  chapter: string;
}

interface AbandonmentData {
  partialSaves: PartialSave[];
  killQuestions: KillQuestion[];
  totalPartialSaves: number;
  totalCompleted: number;
  abandonmentRate: number;
  avgProgressBeforeAbandon: number;
  hourlyPattern: Array<{ hour: number; count: number }>;
}

const TABS = ["Overview", "Partial Saves", "Kill Questions"] as const;
type Tab = (typeof TABS)[number];
const TOTAL_QUESTIONS = 61;

export default function AbandonmentDashboard() {
  const [days, setDays] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<AbandonmentData>("/api/admin/abandonment", params);

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
        {error || "Failed to load abandonment data."}
      </div>
    );
  }

  const maxHourly = Math.max(...data.hourlyPattern.map((h) => h.count), 1);
  const maxKill = data.killQuestions[0]?.abandonCount || 1;

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

      {activeTab === "Overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Partial Saves
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{data.totalPartialSaves}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Completed
              </p>
              <p className="mt-1 text-2xl font-bold text-green-400">{data.totalCompleted}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Abandonment Rate
              </p>
              <p className="mt-1 text-2xl font-bold text-red-400">{data.abandonmentRate}%</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Avg Progress
              </p>
              <p className="mt-1 text-2xl font-bold text-text-primary">
                Q{data.avgProgressBeforeAbandon}
                <span className="text-sm text-text-muted">/{TOTAL_QUESTIONS}</span>
              </p>
            </div>
          </div>

          {/* Kill Questions Chart */}
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-medium text-text-primary">
              Top Kill Questions (Most Abandons)
            </h3>
            <div className="space-y-2">
              {data.killQuestions.slice(0, 10).map((kq, i) => (
                <div key={kq.qId} className="flex items-center gap-3">
                  <span className="w-20 truncate text-sm text-text-muted">{kq.qId}</span>
                  <div className="h-6 flex-1 rounded bg-white/5">
                    <div
                      className={`h-full rounded ${i < 3 ? "bg-red-500/60" : "bg-accent-purple/40"}`}
                      style={{ width: `${(kq.abandonCount / maxKill) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm text-text-muted">{kq.abandonCount}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hourly Pattern */}
          <div className="rounded-xl border border-white/10 bg-surface p-5">
            <h3 className="mb-4 text-sm font-medium text-text-primary">
              Abandonment by Hour (UTC)
            </h3>
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {data.hourlyPattern.map((h) => (
                <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-accent-purple/50"
                    style={{
                      height: `${maxHourly > 0 ? (h.count / maxHourly) * 100 : 0}px`,
                      minHeight: h.count > 0 ? 4 : 0,
                    }}
                  />
                  <span className="text-[9px] text-text-muted">{h.hour}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Partial Saves" && (
        <div className="rounded-xl border border-white/10 bg-surface overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Answers</th>
                <th className="px-4 py-3">UTM</th>
                <th className="px-4 py-3">Saved At</th>
              </tr>
            </thead>
            <tbody>
              {data.partialSaves.map((ps) => {
                const pct = (ps.currentIndex / TOTAL_QUESTIONS) * 100;
                const color =
                  pct < 25 ? "text-red-400" : pct < 50 ? "text-yellow-400" : "text-green-400";
                return (
                  <tr key={ps.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">
                      {ps.sessionId.slice(0, 8)}...
                    </td>
                    <td className={`px-4 py-3 font-medium ${color}`}>
                      {ps.currentIndex}/{TOTAL_QUESTIONS}{" "}
                      <span className="text-xs text-text-muted">({Math.round(pct)}%)</span>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{ps.durationMin}m</td>
                    <td className="px-4 py-3 text-text-muted">{ps.answersCount}</td>
                    <td className="px-4 py-3 text-text-muted">{ps.utmTracker || "—"}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {new Date(ps.savedAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "Kill Questions" && (
        <div className="rounded-xl border border-white/10 bg-surface overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Question ID</th>
                <th className="px-4 py-3">Chapter</th>
                <th className="px-4 py-3">Abandon Count</th>
                <th className="px-4 py-3">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {data.killQuestions.map((kq, i) => {
                const totalAbandons = data.killQuestions.reduce((s, q) => s + q.abandonCount, 0);
                const pct =
                  totalAbandons > 0 ? Math.round((kq.abandonCount / totalAbandons) * 100) : 0;
                return (
                  <tr
                    key={kq.qId}
                    className={`border-b border-white/5 ${i < 3 ? "bg-red-500/5" : "hover:bg-white/5"}`}
                  >
                    <td className="px-4 py-3 text-text-muted">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-text-primary">{kq.qId}</td>
                    <td className="px-4 py-3 text-text-muted">{kq.chapter}</td>
                    <td className="px-4 py-3 font-medium text-red-400">{kq.abandonCount}</td>
                    <td className="px-4 py-3 text-text-muted">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
