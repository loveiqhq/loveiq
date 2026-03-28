"use client";

import { useState } from "react";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import ConversionFunnelTab from "@/components/admin/funnel-tabs/ConversionFunnelTab";
import CohortAnalysisTab from "@/components/admin/funnel-tabs/CohortAnalysisTab";

const tabs = ["Conversion Funnel", "Cohort Analysis"] as const;
type Tab = (typeof tabs)[number];

export default function FunnelsDashboard() {
  const [days, setDays] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("Conversion Funnel");

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
      {activeTab === "Conversion Funnel" && <ConversionFunnelTab days={days} />}
      {activeTab === "Cohort Analysis" && <CohortAnalysisTab days={days} />}
    </div>
  );
}
