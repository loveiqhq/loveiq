"use client";

import { useState } from "react";
import AccessRiskTab from "@features/admin/ui/tools-tabs/AccessRiskTab";
import AuditLogTab from "@features/admin/ui/tools-tabs/AuditLogTab";
import AlertPoliciesTab from "@features/admin/ui/tools-tabs/AlertPoliciesTab";
import DashboardSubscriptionsTab from "@features/admin/ui/tools-tabs/DashboardSubscriptionsTab";
import ExportPresetsTab from "@features/admin/ui/tools-tabs/ExportPresetsTab";
import ReviewQueueTab from "@features/admin/ui/tools-tabs/ReviewQueueTab";
import WorkspaceMaturityTab from "@features/admin/ui/tools-tabs/WorkspaceMaturityTab";

const TABS = [
  "Audit Log",
  "Access & Risk",
  "Review Queue",
  "Alert Policies",
  "Dashboard Subscriptions",
  "Workspace Maturity",
  "Export Presets",
] as const;
type Tab = (typeof TABS)[number];

export default function AdminToolsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Audit Log");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Admin Tools</h1>

      {/* Tab selector */}
      <div className="inline-flex rounded-lg border border-white/10 bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
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
      {activeTab === "Audit Log" && <AuditLogTab />}
      {activeTab === "Access & Risk" && <AccessRiskTab />}
      {activeTab === "Review Queue" && <ReviewQueueTab />}
      {activeTab === "Alert Policies" && <AlertPoliciesTab />}
      {activeTab === "Dashboard Subscriptions" && <DashboardSubscriptionsTab />}
      {activeTab === "Workspace Maturity" && <WorkspaceMaturityTab />}
      {activeTab === "Export Presets" && <ExportPresetsTab />}
    </div>
  );
}
