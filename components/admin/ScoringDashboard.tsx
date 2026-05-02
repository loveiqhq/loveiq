"use client";

import { useState } from "react";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import AgreementTab from "@/components/admin/scoring-tabs/AgreementTab";
import DistributionTab from "@/components/admin/scoring-tabs/DistributionTab";
import DriftTab from "@/components/admin/scoring-tabs/DriftTab";
import DisagreementsTab from "@/components/admin/scoring-tabs/DisagreementsTab";
import ConfidenceTab from "@/components/admin/scoring-tabs/ConfidenceTab";

const tabs = ["Agreement", "Confidence", "Distribution", "Drift", "Disagreements"] as const;
type Tab = (typeof tabs)[number];

export default function ScoringDashboard() {
  const [days, setDays] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("Agreement");

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
      {activeTab === "Agreement" && <AgreementTab days={days} />}
      {activeTab === "Confidence" && <ConfidenceTab days={days} />}
      {activeTab === "Distribution" && <DistributionTab days={days} />}
      {activeTab === "Drift" && <DriftTab days={days} />}
      {activeTab === "Disagreements" && <DisagreementsTab days={days} />}
    </div>
  );
}
