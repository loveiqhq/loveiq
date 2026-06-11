"use client";

import { useMemo, useState } from "react";
import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import StatCard from "@features/admin/ui/StatCard";
import SankeyDiagram from "@features/admin/ui/journey/SankeyDiagram";
import FunnelFlowTab from "@features/admin/ui/journey/FunnelFlowTab";

interface JourneyNode {
  id: string;
  label: string;
  count: number;
}

interface JourneyLink {
  source: string;
  target: string;
  value: number;
}

interface JourneyData {
  days: number;
  nodes: JourneyNode[];
  links: JourneyLink[];
  totalUsers: number;
  overallConversion: number;
  lineageSummary: {
    waitlist: number;
    started: number;
    partial: number;
    completed: number;
    scored: number;
    reportGenerated: number;
    reportViewed: number;
    paid: number;
  };
  partialAnalytics: {
    totalPartials: number;
    avgCheckpoint: number;
    checkpoints: Array<{
      checkpoint: number;
      count: number;
      recovered: number;
      recoveryRate: number;
    }>;
    placementSegments: Array<{
      placement: string;
      partials: number;
      recovered: number;
      recoveryRate: number;
      avgAnswers: number;
    }>;
  };
  cohorts: Array<{
    path: string;
    total: number;
    completed: number;
    viewed: number;
    paid: number;
    completionRate: number;
    viewRate: number;
    paidRate: number;
  }>;
}

const TABS = ["Funnel Flow", "Lineage Graph", "Partial Analytics"] as const;
type Tab = (typeof TABS)[number];

export default function JourneyDashboard() {
  const [days, setDays] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("Funnel Flow");
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  // Powers the Lineage / Partial tabs only. The Funnel Flow tab fetches its own
  // segmented data, so it renders independently of this request.
  const { data, loading, error } = useAdminFetch<JourneyData>("/api/admin/journey", params);

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

      {activeTab === "Funnel Flow" && <FunnelFlowTab />}

      {activeTab !== "Funnel Flow" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <TimeRangeSelector value={days} onChange={setDays} />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
            </div>
          ) : error || !data ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
              {error || "Failed to load journey data."}
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total Users" value={data.totalUsers} />
                <StatCard label="Scored" value={data.lineageSummary.scored} />
                <StatCard label="Overall Conversion" value={`${data.overallConversion}%`} />
                <StatCard label="Paid" value={data.lineageSummary.paid} />
              </div>

              {activeTab === "Lineage Graph" && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-white/10 bg-surface p-5">
                    <h3 className="mb-4 text-sm font-medium text-text-primary">
                      Response Lineage Graph
                    </h3>
                    <SankeyDiagram nodes={data.nodes} links={data.links} />
                  </div>

                  <div className="rounded-xl border border-white/10 bg-surface p-5">
                    <h3 className="mb-4 text-sm font-medium text-text-primary">
                      Lineage By Entry Path
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-text-muted">
                            <th className="px-4 py-3">Entry Path</th>
                            <th className="px-4 py-3">Starts</th>
                            <th className="px-4 py-3">Completion</th>
                            <th className="px-4 py-3">Report View</th>
                            <th className="px-4 py-3">Paid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.cohorts.map((cohort) => (
                            <tr
                              key={cohort.path}
                              className="border-b border-white/5 hover:bg-white/5"
                            >
                              <td className="px-4 py-3 text-text-primary">{cohort.path}</td>
                              <td className="px-4 py-3 text-text-muted">{cohort.total}</td>
                              <td className="px-4 py-3 text-text-muted">
                                {cohort.completionRate}%
                              </td>
                              <td className="px-4 py-3 text-text-muted">{cohort.viewRate}%</td>
                              <td className="px-4 py-3 text-text-muted">{cohort.paidRate}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "Partial Analytics" && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard label="Partial Saves" value={data.partialAnalytics.totalPartials} />
                    <StatCard
                      label="Avg Checkpoint"
                      value={`Q${data.partialAnalytics.avgCheckpoint}`}
                    />
                    <StatCard
                      label="Top Placement"
                      value={data.partialAnalytics.placementSegments[0]?.placement ?? "—"}
                    />
                    <StatCard
                      label="Top Recovery"
                      value={
                        data.partialAnalytics.placementSegments[0]
                          ? `${data.partialAnalytics.placementSegments[0].recoveryRate}%`
                          : "—"
                      }
                    />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-surface p-5">
                      <h3 className="mb-4 text-sm font-medium text-text-primary">
                        Checkpoint Recovery
                      </h3>
                      <div className="space-y-3">
                        {data.partialAnalytics.checkpoints.map((checkpoint) => (
                          <div
                            key={checkpoint.checkpoint}
                            className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-text-primary">
                                Question {checkpoint.checkpoint}
                              </p>
                              <p className="text-sm text-text-muted">
                                {checkpoint.recoveryRate}% recovered
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-text-muted">
                              {checkpoint.count} saves · {checkpoint.recovered} later completed
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-surface p-5">
                      <h3 className="mb-4 text-sm font-medium text-text-primary">
                        Partial Submission Segments
                      </h3>
                      <div className="space-y-3">
                        {data.partialAnalytics.placementSegments.map((segment) => (
                          <div
                            key={segment.placement}
                            className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-text-primary">
                                {segment.placement}
                              </p>
                              <p className="text-sm text-text-muted">
                                {segment.recoveryRate}% recovery
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-text-muted">
                              {segment.partials} partials · avg {segment.avgAnswers} answers saved
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
