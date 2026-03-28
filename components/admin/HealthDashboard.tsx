"use client";

import { useState } from "react";
import ServicesTab from "@/components/admin/health-tabs/ServicesTab";
import ErrorsTab from "@/components/admin/health-tabs/ErrorsTab";
import PerformanceTab from "@/components/admin/health-tabs/PerformanceTab";

const tabs = ["Services", "Errors", "Performance"] as const;
type Tab = (typeof tabs)[number];

export default function HealthDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Services");

  return (
    <div className="space-y-6">
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
      {activeTab === "Services" && <ServicesTab />}
      {activeTab === "Errors" && <ErrorsTab />}
      {activeTab === "Performance" && <PerformanceTab />}
    </div>
  );
}
