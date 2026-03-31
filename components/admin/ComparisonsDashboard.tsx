"use client";

import { useState } from "react";
import ABComparisonTab from "@/components/admin/comparison-tabs/ABComparisonTab";
import ArchetypeCorrelationTab from "@/components/admin/comparison-tabs/ArchetypeCorrelationTab";
import SegmentMigrationTab from "@/components/admin/comparison-tabs/SegmentMigrationTab";

const tabs = ["A/B Comparison", "Segment Migration", "Archetype Correlation"] as const;
type Tab = (typeof tabs)[number];

export default function ComparisonsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("A/B Comparison");

  return (
    <div className="space-y-6">
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
      {activeTab === "A/B Comparison" && <ABComparisonTab />}
      {activeTab === "Segment Migration" && <SegmentMigrationTab />}
      {activeTab === "Archetype Correlation" && <ArchetypeCorrelationTab />}
    </div>
  );
}
