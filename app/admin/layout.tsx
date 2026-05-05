"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminCommandPalette from "@/components/admin/AdminCommandPalette";
import PagePresence from "@/components/admin/PagePresence";

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/submissions": "Submissions",
  "/admin/survey-status": "Survey Status",
  "/admin/product-kpis": "Product KPIs",
  "/admin/analytics": "Core KPIs",
  "/admin/funnels": "Funnels & Cohorts",
  "/admin/comparisons": "Comparisons",
  "/admin/answers": "Answer Explorer",
  "/admin/pulse": "Live Pulse",
  "/admin/growth": "Growth",
  "/admin/tools": "Admin Tools",
  "/admin/submissions/compare": "Compare Submissions",
  "/admin/scoring": "Scoring V4↔V5 (V6Q)",
  "/admin/reports": "Report Engagement",
  "/admin/revenue": "Revenue",
  "/admin/retention": "Retention",
  "/admin/scorecard": "Question Scorecard",
  "/admin/text-analysis": "Text Analysis",
  "/admin/research": "Research Intelligence",
  "/admin/activity": "Admin Activity",
  "/admin/archetypes": "Archetypes",
  "/admin/journey": "User Journey",
  "/admin/health": "Data Health",
  "/admin/abandonment": "Abandonment Recovery",
  "/admin/replay": "Session Replay",
  "/admin/profiles": "User Profiles",
  "/admin/question-effectiveness": "Question Effectiveness",
  "/admin/invite-network": "Invite Network",
  "/admin/risk-score": "Risk Score",
  "/admin/changelog": "Product Changelog",
  "/admin/tags": "Submission Tags",
  "/admin/auto-tag-rules": "Auto-Tag Rules",
  "/admin/language-analytics": "Language Analytics",
  "/admin/goals": "Goals & Targets",
  "/admin/report-builder": "Report Builder",
  "/admin/archetypes/compare": "Compare Archetypes",
  "/admin/pipeline": "Conversion Pipeline",
  "/admin/segments": "Segments",
  "/admin/predictions": "Predictive Insights",
  "/admin/strategy": "Strategy Hub",
  "/admin/experiments": "Experiment Registry",
  "/admin/question-lifecycle": "Question Lifecycle",
  "/admin/benchmarks": "Benchmark Registry",
  "/admin/org": "Org Directory",
};

const pageDescriptions: Record<string, string> = {
  "/admin": "Overview of key metrics, submission trends, and recent activity across the platform.",
  "/admin/submissions":
    "Browse, filter, and manage all survey submissions. Flag, archive, or open individual responses.",
  "/admin/survey-status":
    "Toggle the survey open or closed. Changes take effect immediately for all users.",
  "/admin/product-kpis":
    "Track product health metrics: completion rates, question scores, and chapter engagement.",
  "/admin/analytics":
    "Single source of truth for marketing, funnel, monetization, engagement, virality, retention, and segmentation KPIs.",
  "/admin/funnels":
    "Analyze conversion funnels and cohort retention to see where users drop off or progress.",
  "/admin/comparisons": "Compare metrics across time periods, archetypes, or cohorts side by side.",
  "/admin/answers": "Explore answer distributions by question, chapter, archetype, or UTM source.",
  "/admin/pulse": "Real-time feed of live user activity, active sessions, and at-risk sessions.",
  "/admin/growth":
    "Track referral chains, geographic spread, and waitlist-to-completion conversion.",
  "/admin/tools": "Admin utilities: full audit log and saved export presets.",
  "/admin/submissions/compare":
    "Place two submissions side by side to compare answers, scores, and timing.",
  "/admin/scoring":
    "Compare V4 and V5 scoring engines on V6 questionnaire: agreement rates, distribution drift, and disagreements.",
  "/admin/reports":
    "Monitor how users engage with their generated reports: views, ratings, and shares.",
  "/admin/revenue": "Track revenue, payment transactions, and failed payment analysis.",
  "/admin/retention": "Analyze retention funnels, cohort stickiness, and viral loop metrics.",
  "/admin/scorecard":
    "Grade each survey question (A\u2013F) on drop-off, friction, completion, and discrimination.",
  "/admin/text-analysis":
    "Analyze free-text responses: word clouds, keyword frequency, and per-question breakdowns.",
  "/admin/research":
    "Research operating surface for signal synthesis, pain severity, emerging language, and persona drift.",
  "/admin/activity":
    "Audit trail of all admin actions, broken down by admin, action type, and date.",
  "/admin/archetypes":
    "View all 14 archetypes with V4/V5 distribution (V6 questionnaire), weekly trends, and scored submission counts.",
  "/admin/journey":
    "Sankey diagram of user flow through survey stages, with drop-off and conversion rates.",
  "/admin/health": "Monitor service status, error rates, and system performance metrics.",
  "/admin/abandonment":
    "Identify abandoned sessions, find kill questions, and analyze hourly abandonment patterns.",
  "/admin/replay":
    "Replay reconstructed user sessions: see every question visit, backtrack, and skip.",
  "/admin/profiles": "Browse user demographics and individual profiles with submission history.",
  "/admin/question-effectiveness":
    "Measure each question's reach, drop-off rate, friction index, and skip rate.",
  "/admin/invite-network":
    "Visualize referral networks, top referrers, and invitation method breakdowns.",
  "/admin/risk-score":
    "Identify high-risk sessions based on behavioral signals like backtracks and timing.",
  "/admin/changelog":
    "Log product changes, feature releases, and bug fixes with dated timeline entries.",
  "/admin/tags": "Create custom tags with colors and assign them to submissions for organization.",
  "/admin/auto-tag-rules":
    "Define rules that auto-apply tags based on duration, backtrack count, or status.",
  "/admin/language-analytics":
    "Analyze user language distribution, completion rates per language, and geographic spread.",
  "/admin/goals": "Set numeric targets for key metrics and track progress over time.",
  "/admin/report-builder":
    "Generate on-demand snapshot reports with submission stats, trends, and archetype data.",
  "/admin/archetypes/compare":
    "Compare archetypes side by side: A/B comparison and correlation heatmap.",
  "/admin/pipeline": "Track conversion through each pipeline stage: waitlist, started, completed.",
  "/admin/segments":
    "Build custom user segments with AND/OR filters and preview matching submissions.",
  "/admin/predictions":
    "AI-generated forecasts for volume, abandonment, conversions, and archetype trends.",
  "/admin/strategy":
    "Cross-functional strategy and operations hub: north star metrics, work queue, release impact, opportunities, and benchmark tracking.",
  "/admin/experiments":
    "Track active and planned experiments with owners, target metrics, guardrails, and decision dates.",
  "/admin/question-lifecycle":
    "Decide which questions to keep, revise, replace, or retire using friction, regression, and predictive signals.",
  "/admin/benchmarks":
    "Manage internal, category, and competitive benchmark references used across strategy views.",
  "/admin/org":
    "Org-wide control plane for admin assets, data freshness, ownership gaps, and operational watchpoints.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

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

  const description =
    pageDescriptions[pathname] ||
    (pathname.startsWith("/admin/submissions/")
      ? "Full submission details: answers, scores, journey timeline, and admin notes."
      : pathname.startsWith("/admin/archetypes/")
        ? "Deep dive into one archetype: demographics, behavior, dimensions, answers, and growth."
        : "");

  return (
    <div className="flex h-screen bg-page text-text-primary">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <AdminCommandPalette
        open={commandPaletteOpen}
        onOpen={() => setCommandPaletteOpen(true)}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader
          title={title}
          onMenuToggle={() => setSidebarOpen((o) => !o)}
          onCommandPaletteOpen={() => setCommandPaletteOpen(true)}
        />
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
