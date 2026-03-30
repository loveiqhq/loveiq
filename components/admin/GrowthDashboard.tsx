"use client";

import { useState } from "react";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import ReferralChainsTab from "@/components/admin/growth-tabs/ReferralChainsTab";
import GeographicMapTab from "@/components/admin/growth-tabs/GeographicMapTab";
import WaitlistConversionTab from "@/components/admin/growth-tabs/WaitlistConversionTab";
import AcquisitionQualityTab from "@/components/admin/growth-tabs/AcquisitionQualityTab";
import RecoveryCohortsTab from "@/components/admin/growth-tabs/RecoveryCohortsTab";
import EmbedPerformanceTab from "@/components/admin/growth-tabs/EmbedPerformanceTab";
import ValueAttributionTab from "@/components/admin/growth-tabs/ValueAttributionTab";

const tabs = [
  "Referral Chains",
  "Geographic Map",
  "Waitlist Conversion",
  "Channel Quality",
  "Embed Performance",
  "Value Attribution",
  "Recovery & Cohorts",
] as const;
type Tab = (typeof tabs)[number];

export default function GrowthDashboard() {
  const [days, setDays] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("Referral Chains");

  return (
    <div className="space-y-6">
      {/* Time range */}
      <div className="flex items-center justify-between">
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      {/* Tab selector */}
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

      {/* Active tab */}
      {activeTab === "Referral Chains" && <ReferralChainsTab days={days} />}
      {activeTab === "Geographic Map" && <GeographicMapTab days={days} />}
      {activeTab === "Waitlist Conversion" && <WaitlistConversionTab days={days} />}
      {activeTab === "Channel Quality" && <AcquisitionQualityTab days={days} />}
      {activeTab === "Embed Performance" && <EmbedPerformanceTab days={days} />}
      {activeTab === "Value Attribution" && <ValueAttributionTab days={days} />}
      {activeTab === "Recovery & Cohorts" && <RecoveryCohortsTab days={days} />}
    </div>
  );
}
