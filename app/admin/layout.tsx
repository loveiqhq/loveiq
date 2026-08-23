"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AdminSidebar from "@features/admin/ui/AdminSidebar";
import AdminHeader from "@features/admin/ui/AdminHeader";
import PagePresence from "@features/admin/ui/PagePresence";

const pageTitles: Record<string, string> = {
  "/admin": "Overview",
  "/admin/analytics": "Core KPIs",
  "/admin/explorer": "Data Explorer",
  "/admin/journey": "User Journey",
  "/admin/funnels": "Funnels & Cohorts",
  "/admin/answers": "Answer Explorer",
  "/admin/submissions": "Submissions",
  "/admin/submissions/compare": "Compare Submissions",
  "/admin/survey-status": "Survey Status",
};

const pageDescriptions: Record<string, string> = {
  "/admin":
    "How the funnel is performing and what each A/B test is actually telling us, with sample sizes and a plain-English verdict.",
  "/admin/analytics":
    "Single source of truth for marketing, funnel, monetization, engagement, virality, retention, and segmentation KPIs.",
  "/admin/explorer":
    "Filter submissions by any combination of archetype, age, gender, country, plan, and paid status — then break them down, cross-tab, and export.",
  "/admin/journey":
    "Sankey diagram of user flow through survey stages, with drop-off and conversion rates.",
  "/admin/funnels":
    "Analyze conversion funnels and cohort retention to see where users drop off or progress.",
  "/admin/answers": "Explore answer distributions by question, chapter, archetype, or UTM source.",
  "/admin/submissions":
    "Browse, filter, and manage all survey submissions. Flag, archive, or open individual responses.",
  "/admin/submissions/compare":
    "Place two submissions side by side to compare answers, scores, and timing.",
  "/admin/survey-status":
    "Toggle the survey open or closed. Changes take effect immediately for all users.",
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
    (pathname.startsWith("/admin/submissions/") ? "Submission Detail" : "Admin");

  const description =
    pageDescriptions[pathname] ||
    (pathname.startsWith("/admin/submissions/")
      ? "Full submission details: answers, scores, journey timeline, and admin notes."
      : "");

  return (
    <div className="flex h-screen bg-page text-text-primary">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader title={title} onMenuToggle={() => setSidebarOpen((o) => !o)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {description && <p className="mb-3 text-sm text-text-muted">{description}</p>}
          <div className="mb-4 flex justify-end">
            <PagePresence />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
