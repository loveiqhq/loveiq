"use client";

import { useState } from "react";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import AcquisitionQualityTab from "@/components/admin/growth-tabs/AcquisitionQualityTab";
import ConversionLeakDebuggerTab from "@/components/admin/growth-tabs/ConversionLeakDebuggerTab";
import CreativeIntelligenceTab from "@/components/admin/growth-tabs/CreativeIntelligenceTab";
import EmbedPerformanceTab from "@/components/admin/growth-tabs/EmbedPerformanceTab";
import GeographicMapTab from "@/components/admin/growth-tabs/GeographicMapTab";
import GrowthControlTowerTab from "@/components/admin/growth-tabs/GrowthControlTowerTab";
import RecoveryCohortsTab from "@/components/admin/growth-tabs/RecoveryCohortsTab";
import ReferralChainsTab from "@/components/admin/growth-tabs/ReferralChainsTab";
import ValueAttributionTab from "@/components/admin/growth-tabs/ValueAttributionTab";
import WaitlistConversionTab from "@/components/admin/growth-tabs/WaitlistConversionTab";
import { buildFunnelsHref } from "@/lib/admin/drilldowns";

const tabs = [
  "Control Tower",
  "Referral Chains",
  "Geo & Language",
  "Waitlist Conversion",
  "Channel Efficiency",
  "Leak Debugger",
  "Creative Intelligence",
  "Embed Performance",
  "Value Attribution",
  "Recovery & Cohorts",
] as const;
type Tab = (typeof tabs)[number];

export default function GrowthDashboard() {
  const [days, setDays] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("Control Tower");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid gap-3 rounded-xl border border-white/10 bg-surface p-4 sm:grid-cols-2 xl:grid-cols-3">
        <a
          href={buildFunnelsHref({
            days,
            tab: "Impact Comparison",
            comparison: "experiment",
          })}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
        >
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Cross Drilldown</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">Open Impact Comparison</p>
          <p className="mt-1 text-xs text-text-muted">
            Compare release, version, and experiment movement from the same time window.
          </p>
        </a>
        <a
          href={buildFunnelsHref({
            days,
            tab: "Cohort Analysis",
            groupBy: "utm",
          })}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
        >
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Cross Drilldown</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">Open Funnel Cohorts</p>
          <p className="mt-1 text-xs text-text-muted">
            Check whether growth movement clusters by source before acting on channel changes.
          </p>
        </a>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-text-muted">Focused State</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">{activeTab}</p>
          <p className="mt-1 text-xs text-text-muted">
            Growth drilldowns now carry the current time window into funnels and impact comparison.
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-white/10 bg-surface p-1">
        {tabs.map((tab) => (
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

      {activeTab === "Control Tower" && <GrowthControlTowerTab days={days} />}
      {activeTab === "Referral Chains" && <ReferralChainsTab days={days} />}
      {activeTab === "Geo & Language" && <GeographicMapTab days={days} />}
      {activeTab === "Waitlist Conversion" && <WaitlistConversionTab days={days} />}
      {activeTab === "Channel Efficiency" && <AcquisitionQualityTab days={days} />}
      {activeTab === "Leak Debugger" && <ConversionLeakDebuggerTab days={days} />}
      {activeTab === "Creative Intelligence" && <CreativeIntelligenceTab days={days} />}
      {activeTab === "Embed Performance" && <EmbedPerformanceTab days={days} />}
      {activeTab === "Value Attribution" && <ValueAttributionTab days={days} />}
      {activeTab === "Recovery & Cohorts" && <RecoveryCohortsTab days={days} />}
    </div>
  );
}
