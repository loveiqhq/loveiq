"use client";

import { useState } from "react";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import ActivityOverviewTab from "@/components/admin/activity-tabs/ActivityOverviewTab";
import PerAdminTab from "@/components/admin/activity-tabs/PerAdminTab";
import BacklogTab from "@/components/admin/activity-tabs/BacklogTab";
import OrgLogTab from "@/components/admin/activity-tabs/OrgLogTab";

const tabs = ["Overview", "Per Admin", "Org Log", "Backlog"] as const;
type Tab = (typeof tabs)[number];

export default function ActivityDashboard() {
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

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
      {activeTab === "Overview" && <ActivityOverviewTab days={days} />}
      {activeTab === "Per Admin" && <PerAdminTab days={days} />}
      {activeTab === "Org Log" && <OrgLogTab days={days} />}
      {activeTab === "Backlog" && <BacklogTab days={days} />}
    </div>
  );
}
