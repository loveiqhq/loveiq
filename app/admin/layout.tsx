"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/submissions": "Submissions",
  "/admin/survey-status": "Survey Status",
  "/admin/product-kpis": "Product KPIs",
  "/admin/funnels": "Funnels & Cohorts",
  "/admin/comparisons": "Comparisons",
  "/admin/answers": "Answer Explorer",
  "/admin/pulse": "Live Pulse",
  "/admin/growth": "Growth",
  "/admin/tools": "Admin Tools",
  "/admin/submissions/compare": "Compare Submissions",
  "/admin/scoring": "Scoring V4↔V5",
  "/admin/reports": "Report Engagement",
  "/admin/revenue": "Revenue",
  "/admin/retention": "Retention",
  "/admin/scorecard": "Question Scorecard",
  "/admin/text-analysis": "Text Analysis",
  "/admin/activity": "Admin Activity",
  "/admin/archetypes": "Archetypes",
  "/admin/journey": "User Journey",
  "/admin/health": "Data Health",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Login page renders without the admin shell
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const title =
    pageTitles[pathname] ||
    (pathname.startsWith("/admin/submissions/")
      ? "Submission Detail"
      : pathname.startsWith("/admin/archetypes/")
        ? "Archetype Profile"
        : "Admin");

  return (
    <div className="flex h-screen bg-page text-text-primary">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader title={title} onMenuToggle={() => setSidebarOpen((o) => !o)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
