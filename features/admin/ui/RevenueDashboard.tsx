"use client";

import { useState } from "react";
import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";
import RevenueOverviewTab from "@features/admin/ui/revenue-tabs/RevenueOverviewTab";
import TransactionsTab from "@features/admin/ui/revenue-tabs/TransactionsTab";
import FailureAnalysisTab from "@features/admin/ui/revenue-tabs/FailureAnalysisTab";

const tabs = ["Overview", "Transactions", "Failures"] as const;
type Tab = (typeof tabs)[number];

export default function RevenueDashboard() {
  const [days, setDays] = useState(0);
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
      {activeTab === "Overview" && <RevenueOverviewTab days={days} />}
      {activeTab === "Transactions" && <TransactionsTab days={days} />}
      {activeTab === "Failures" && <FailureAnalysisTab days={days} />}
    </div>
  );
}
