"use client";

import { useMemo } from "react";
import { useAdminQueryState } from "@/components/admin/hooks/useAdminQueryState";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import ConversionFunnelTab from "@/components/admin/funnel-tabs/ConversionFunnelTab";
import CohortAnalysisTab from "@/components/admin/funnel-tabs/CohortAnalysisTab";
import ImpactComparisonTab from "@/components/admin/funnel-tabs/ImpactComparisonTab";
import {
  FUNNEL_TABS,
  buildProductKpiHref,
  buildScorecardHref,
  parseAdminDays,
  parseCohortComparisonMode,
  parseCohortGroupBy,
  parseFunnelTab,
} from "@/lib/admin/drilldowns";

export default function FunnelsDashboard() {
  const { searchParams, setQueryState } = useAdminQueryState();
  const days = parseAdminDays(searchParams.get("days"));
  const activeTab = parseFunnelTab(searchParams.get("tab"));
  const utmFilter = searchParams.get("utm") || "";
  const groupBy = parseCohortGroupBy(searchParams.get("groupBy"));
  const comparisonMode = parseCohortComparisonMode(searchParams.get("comparison"));
  const focusedState = useMemo(() => {
    if (activeTab === "Conversion Funnel" && utmFilter) return `UTM filter: ${utmFilter}`;
    if (activeTab === "Cohort Analysis") return `Grouped by ${groupBy}`;
    if (activeTab === "Impact Comparison") return `Comparing ${comparisonMode}`;
    return "Current time window is shareable by URL.";
  }, [activeTab, comparisonMode, groupBy, utmFilter]);

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
            tab: activeTab === "Conversion Funnel" ? "Survey Chapters" : "Survey Questions",
          })}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
        >
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Cross Drilldown</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">Open Product KPIs</p>
          <p className="mt-1 text-xs text-text-muted">
            Move from funnel loss into the survey stages and question friction behind it.
          </p>
        </a>
        <a
          href={buildScorecardHref({
            days,
            tab: activeTab === "Cohort Analysis" ? "Trends" : "Scorecard",
          })}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
        >
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Cross Drilldown</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">Open Question Scorecard</p>
          <p className="mt-1 text-xs text-text-muted">
            Check whether conversion loss lines up with weak question scores or skip behavior.
          </p>
        </a>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Focused State</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">{focusedState}</p>
          <p className="mt-1 text-xs text-text-muted">
            Tabs, groupings, time windows, and UTM filters now persist in the URL.
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {FUNNEL_TABS.map((tab) => (
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

      {activeTab === "Conversion Funnel" && (
        <ConversionFunnelTab
          days={days}
          utmFilter={utmFilter}
          onUtmFilterChange={(value) =>
            setQueryState({ utm: value || null, tab: "Conversion Funnel" })
          }
        />
      )}
      {activeTab === "Cohort Analysis" && (
        <CohortAnalysisTab
          days={days}
          groupBy={groupBy}
          onGroupByChange={(value) => setQueryState({ groupBy: value, tab: "Cohort Analysis" })}
        />
      )}
      {activeTab === "Impact Comparison" && (
        <ImpactComparisonTab
          days={days}
          comparisonMode={comparisonMode}
          onComparisonModeChange={(value) =>
            setQueryState({ comparison: value, tab: "Impact Comparison" })
          }
        />
      )}
    </div>
  );
}
