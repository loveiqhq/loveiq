"use client";

import { useState } from "react";
import ActivityFeedTab from "./pulse-tabs/ActivityFeedTab";
import RiskScoringTab from "./pulse-tabs/RiskScoringTab";

const TABS = ["Activity Feed", "At-Risk Sessions"] as const;
type Tab = (typeof TABS)[number];

export default function PulseDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Activity Feed");

  return (
    <div className="space-y-6">
      {/* Tab selector */}
      <div className="flex flex-row rounded-lg border border-white/10 bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "Activity Feed" && <ActivityFeedTab />}
      {activeTab === "At-Risk Sessions" && <RiskScoringTab />}
    </div>
  );
}
