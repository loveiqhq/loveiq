"use client";

import { useMemo } from "react";
import { useAdminQueryState } from "@features/admin/ui/hooks/useAdminQueryState";
import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";
import ScorecardTab from "@features/admin/ui/scorecard-tabs/ScorecardTab";
import TrendsTab from "@features/admin/ui/scorecard-tabs/TrendsTab";
import {
  buildFunnelsHref,
  buildProductKpiHref,
  parseAdminDays,
  parseScorecardTab,
} from "@features/admin/server/drilldowns";

const tabs = ["Scorecard", "Trends"] as const;

export default function ScorecardDashboard() {
  const { searchParams, setQueryState } = useAdminQueryState();
  const days = parseAdminDays(searchParams.get("days"));
  const activeTab = parseScorecardTab(searchParams.get("tab"));
  const focusedQuestion = searchParams.get("question") || null;
  const focusedLabel = useMemo(
    () =>
      focusedQuestion
        ? `Focused on ${focusedQuestion}`
        : "Current time window is shareable by URL.",
    [focusedQuestion]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <TimeRangeSelector
          value={days}
          onChange={(value) => setQueryState({ days: value > 0 ? value : null })}
        />
      </div>

      <div className="grid gap-3 rounded-xl border border-white/10 bg-surface p-4 sm:grid-cols-2 xl:grid-cols-3">
        <a
          href={buildProductKpiHref({
            days,
            tab: focusedQuestion ? "Survey Questions" : "Discrimination",
          })}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
        >
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Cross Drilldown</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">Open Product KPIs</p>
          <p className="mt-1 text-xs text-text-muted">
            Move from score quality to friction and chapter-level completion signals.
          </p>
        </a>
        <a
          href={buildFunnelsHref({ days, tab: "Cohort Analysis", groupBy: "utm" })}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
        >
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Cross Drilldown</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">Open Funnel Cohorts</p>
          <p className="mt-1 text-xs text-text-muted">
            Check whether weak question performance clusters by source or cohort.
          </p>
        </a>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Focused State</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">{focusedLabel}</p>
          <p className="mt-1 text-xs text-text-muted">
            Tabs and time windows now persist in the URL for repeatable scorecard reviews.
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setQueryState({ tab })}
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

      {activeTab === "Scorecard" && <ScorecardTab days={days} question={focusedQuestion} />}
      {activeTab === "Trends" && <TrendsTab days={days} question={focusedQuestion} />}
    </div>
  );
}
