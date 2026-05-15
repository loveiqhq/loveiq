"use client";

import { useState } from "react";
import EmbeddedIntelligencePanel from "@features/admin/ui/EmbeddedIntelligencePanel";
import AdminKnowledgePanel from "@features/admin/ui/AdminKnowledgePanel";
import AdminSignalGraphPanel from "@features/admin/ui/AdminSignalGraphPanel";
import ServicesTab from "@features/admin/ui/health-tabs/ServicesTab";
import AnomalyCenterTab from "@features/admin/ui/health-tabs/AnomalyCenterTab";
import IncidentCorrelationTab from "@features/admin/ui/health-tabs/IncidentCorrelationTab";
import DriftDetectorTab from "@features/admin/ui/health-tabs/DriftDetectorTab";
import ErrorsTab from "@features/admin/ui/health-tabs/ErrorsTab";
import PerformanceTab from "@features/admin/ui/health-tabs/PerformanceTab";
import IntegrationsTab from "@features/admin/ui/health-tabs/IntegrationsTab";
import TrustTrackingTab from "@features/admin/ui/health-tabs/TrustTrackingTab";

const tabs = [
  "Services",
  "Integrations",
  "Trust & Tracking",
  "Anomalies",
  "Incident Correlation",
  "Drift Detector",
  "Errors",
  "Performance",
] as const;
type Tab = (typeof tabs)[number];

export default function HealthDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Services");

  return (
    <div className="space-y-6">
      <EmbeddedIntelligencePanel surface="health" days={30} title="Health Copilot" />
      <EmbeddedIntelligencePanel
        endpoint="/api/admin/resilience-intelligence"
        surface="health"
        days={30}
        title="Health Resilience Intelligence"
      />
      <EmbeddedIntelligencePanel
        endpoint="/api/admin/optimization-intelligence"
        surface="health"
        days={30}
        title="Compliance Drift Intelligence"
      />
      <EmbeddedIntelligencePanel
        endpoint="/api/admin/tech-intelligence"
        surface="health"
        days={30}
        title="Tech Root-Cause Intelligence"
      />
      <AdminKnowledgePanel surface="health" days={30} title="Health Memory" />
      <AdminSignalGraphPanel surface="health" days={30} title="Root-Cause Graph" />

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
      {activeTab === "Integrations" && <IntegrationsTab />}
      {activeTab === "Trust & Tracking" && <TrustTrackingTab />}
      {activeTab === "Anomalies" && <AnomalyCenterTab />}
      {activeTab === "Incident Correlation" && <IncidentCorrelationTab />}
      {activeTab === "Drift Detector" && <DriftDetectorTab />}
      {activeTab === "Errors" && <ErrorsTab />}
      {activeTab === "Performance" && <PerformanceTab />}
    </div>
  );
}
