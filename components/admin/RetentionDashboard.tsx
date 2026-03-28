"use client";

import { useState } from "react";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import RetentionFunnelTab from "@/components/admin/retention-tabs/RetentionFunnelTab";
import RetentionCohortsTab from "@/components/admin/retention-tabs/RetentionCohortsTab";
import ViralityTab from "@/components/admin/retention-tabs/ViralityTab";

const tabs = ["Funnel", "Cohorts", "Virality"] as const;
type Tab = (typeof tabs)[number];

export default function RetentionDashboard() {
  const [days, setDays] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("Funnel");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <TimeRangeSelector value={days} onChange={setDays} />
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
      {activeTab === "Funnel" && <RetentionFunnelTab days={days} />}
      {activeTab === "Cohorts" && <RetentionCohortsTab days={days} />}
      {activeTab === "Virality" && <ViralityTab days={days} />}
    </div>
  );
}
