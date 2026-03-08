"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import StatCard from "./StatCard";
import BarChart from "./BarChart";
import TimeRangeSelector from "./TimeRangeSelector";
import { surveyQuestions } from "@/data/survey-data";

interface StatsData {
  totalSubmissions: number;
  completionRate: number;
  avgDurationMs: number | null;
  statusBreakdown: {
    completed: number;
    flagged: number;
    archived: number;
  };
  todayCount: number;
  dropOff: Array<{ qId: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
  durationBuckets: {
    under5m: number;
    fiveTo15m: number;
    fifteenTo30m: number;
    over30m: number;
  };
  utmSources: Array<{ source: string; count: number }>;
  hourly: Array<{ hour: number; count: number }>;
  // Behavior analytics (from RPC)
  avgTimePerQuestion: Array<{ qId: string; avgMs: number }>;
  funnel: { uniqueSessions: number; completedSessions: number; abandonedSessions: number };
  chapterDropOff: Array<{ chapter: string; count: number }>;
  backtrackRate: number;
  backtrackByQuestion: Array<{ qId: string; count: number }>;
  // Waitlist (nullable — graceful degradation)
  waitlistTotal: number | null;
  waitlistToday: number | null;
  waitlistDaily: Array<{ date: string; count: number }> | null;
  waitlistUtmSources: Array<{ source: string; count: number }> | null;
  // Answer insights (nullable — graceful degradation)
  countryDistribution: Array<{ country: string; count: number }> | null;
  scaleAvg: Array<{ qId: string; avg: number }> | null;
  skipRate: Array<{ qId: string; skipped: number; total: number }> | null;
}

function truncateLabel(text: string, max = 50): string {
  return text.length > max ? text.slice(0, max - 3) + "\u2026" : text;
}

export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<StatsData>("/api/admin/stats", params);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
        {error || "Failed to load stats"}
      </div>
    );
  }

  const qMap = new Map(surveyQuestions.map((q) => [q.qId, q.question]));

  // Existing transforms
  const dropOffItems = data.dropOff.map((d) => ({
    label: truncateLabel(qMap.get(d.qId) ?? d.qId),
    value: d.count,
  }));
  const dailyItems = data.daily.map((d) => ({ label: d.date.slice(5), value: d.count }));
  const durationItems = [
    { label: "< 5 min", value: data.durationBuckets.under5m },
    { label: "5\u201315 min", value: data.durationBuckets.fiveTo15m },
    { label: "15\u201330 min", value: data.durationBuckets.fifteenTo30m },
    { label: "> 30 min", value: data.durationBuckets.over30m },
  ];
  const utmItems = data.utmSources.map((u) => ({ label: u.source, value: u.count }));
  const hourlyItems = data.hourly.map((h) => ({ label: `${h.hour}h`, value: h.count }));

  // Format average duration
  const avgDuration = data.avgDurationMs
    ? data.avgDurationMs >= 60_000
      ? `${Math.round(data.avgDurationMs / 60_000)}m ${Math.round((data.avgDurationMs % 60_000) / 1_000)}s`
      : `${Math.round(data.avgDurationMs / 1_000)}s`
    : "\u2014";

  // Funnel stat
  const funnelRate =
    data.funnel.uniqueSessions > 0
      ? `${Math.round((data.funnel.completedSessions / data.funnel.uniqueSessions) * 100)}%`
      : "\u2014";

  // New transforms — Behavior
  const avgTimeItems = data.avgTimePerQuestion.map((d) => ({
    label: truncateLabel(qMap.get(d.qId) ?? d.qId),
    value: Math.round(d.avgMs / 1000),
  }));
  const chapterDropOffItems = data.chapterDropOff.map((d) => ({
    label: d.chapter,
    value: d.count,
  }));
  const backtrackItems = data.backtrackByQuestion.map((d) => ({
    label: truncateLabel(qMap.get(d.qId) ?? d.qId),
    value: d.count,
  }));

  // Waitlist transforms
  const waitlistDailyItems = data.waitlistDaily?.map((d) => ({
    label: d.date.slice(5),
    value: d.count,
  }));
  const waitlistUtmItems = data.waitlistUtmSources?.map((u) => ({
    label: u.source,
    value: u.count,
  }));

  // Answer insight transforms
  const countryItems = data.countryDistribution?.map((d) => ({
    label: d.country,
    value: d.count,
  }));
  const scaleAvgItems = data.scaleAvg?.map((d) => ({
    label: truncateLabel(qMap.get(d.qId) ?? d.qId),
    value: d.avg,
  }));
  const skipRateItems = data.skipRate?.map((d) => ({
    label: truncateLabel(qMap.get(d.qId) ?? d.qId),
    value: d.skipped,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-text-primary">Overview</h2>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      {/* Row 1: Key metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Submissions" value={data.totalSubmissions} />
        <StatCard label="Today" value={data.todayCount} />
        <StatCard label="Completion Rate" value={`${data.completionRate}%`} />
        <StatCard label="Avg Duration" value={avgDuration} />
        <StatCard
          label="Waitlist Signups"
          value={data.waitlistTotal ?? "\u2014"}
          sub={data.waitlistToday != null ? `${data.waitlistToday} today` : undefined}
        />
        <StatCard
          label="Session Funnel"
          value={funnelRate}
          sub={
            data.funnel.uniqueSessions > 0
              ? `${data.funnel.completedSessions}/${data.funnel.uniqueSessions} sessions`
              : undefined
          }
        />
      </div>

      {/* Row 2: Status breakdown */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface p-4">
          <div className="h-3 w-3 rounded-full bg-emerald-500" />
          <div>
            <p className="text-xs text-text-muted">Completed</p>
            <p className="font-serif text-lg font-bold text-text-primary">
              {data.statusBreakdown.completed}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface p-4">
          <div className="h-3 w-3 rounded-full bg-amber-500" />
          <div>
            <p className="text-xs text-text-muted">Flagged</p>
            <p className="font-serif text-lg font-bold text-text-primary">
              {data.statusBreakdown.flagged}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface p-4">
          <div className="h-3 w-3 rounded-full bg-gray-500" />
          <div>
            <p className="text-xs text-text-muted">Archived</p>
            <p className="font-serif text-lg font-bold text-text-primary">
              {data.statusBreakdown.archived}
            </p>
          </div>
        </div>
      </div>

      {/* Row 3: Submissions Over Time + Peak Hours */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Submissions Over Time</h3>
          {dailyItems.length > 0 ? (
            <BarChart items={dailyItems} direction="vertical" maxHeight={180} />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data yet</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            Peak Submission Hours (UTC)
          </h3>
          {hourlyItems.length > 0 ? (
            <BarChart items={hourlyItems} direction="vertical" maxHeight={180} />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data yet</p>
          )}
        </div>
      </div>

      {/* Row 4: Drop-off Questions + UTM Sources */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Top Drop-off Questions</h3>
          {dropOffItems.length > 0 ? (
            <BarChart items={dropOffItems} direction="horizontal" />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No drop-off data yet</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">UTM Sources</h3>
          {utmItems.length > 0 ? (
            <BarChart items={utmItems} direction="horizontal" />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No UTM data yet</p>
          )}
        </div>
      </div>

      {/* Row 5: Completion Time Distribution */}
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">
          Completion Time Distribution
        </h3>
        <BarChart items={durationItems} direction="horizontal" />
      </div>

      {/* ─── Waitlist ─── */}
      <h2 className="font-serif text-lg font-bold text-text-primary pt-2">Waitlist</h2>

      {/* Row 6: Waitlist Signups Over Time + Waitlist UTM Sources */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            Waitlist Signups Over Time
          </h3>
          {waitlistDailyItems && waitlistDailyItems.length > 0 ? (
            <BarChart items={waitlistDailyItems} direction="vertical" maxHeight={180} />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Waitlist UTM Sources</h3>
          {waitlistUtmItems && waitlistUtmItems.length > 0 ? (
            <BarChart items={waitlistUtmItems} direction="horizontal" />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data</p>
          )}
        </div>
      </div>

      {/* ─── Behavior Analytics ─── */}
      <h2 className="font-serif text-lg font-bold text-text-primary pt-2">Behavior Analytics</h2>

      {/* Row 7: Avg Time Per Question + Chapter Drop-off */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            Avg Time Per Question (seconds)
          </h3>
          {avgTimeItems.length > 0 ? (
            <BarChart items={avgTimeItems} direction="horizontal" />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Chapter Drop-off</h3>
          {chapterDropOffItems.length > 0 ? (
            <BarChart items={chapterDropOffItems} direction="horizontal" />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data</p>
          )}
        </div>
      </div>

      {/* Row 8: Backtracked Questions + Skipped Questions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            Most Backtracked Questions
            {data.backtrackRate > 0 && (
              <span className="ml-2 text-xs font-normal text-text-muted">
                ({data.backtrackRate}% backtrack rate)
              </span>
            )}
          </h3>
          {backtrackItems.length > 0 ? (
            <BarChart items={backtrackItems} direction="horizontal" />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Most Skipped Questions</h3>
          {skipRateItems && skipRateItems.length > 0 ? (
            <BarChart items={skipRateItems} direction="horizontal" />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data</p>
          )}
        </div>
      </div>

      {/* ─── Answer Insights ─── */}
      <h2 className="font-serif text-lg font-bold text-text-primary pt-2">Answer Insights</h2>

      {/* Row 9: Country Distribution + Scale Question Averages */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Country Distribution</h3>
          {countryItems && countryItems.length > 0 ? (
            <BarChart items={countryItems} direction="horizontal" />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Scale Question Averages</h3>
          {scaleAvgItems && scaleAvgItems.length > 0 ? (
            <BarChart items={scaleAvgItems} direction="horizontal" />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data</p>
          )}
        </div>
      </div>
    </div>
  );
}
