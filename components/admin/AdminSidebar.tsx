"use client";

import { usePathname } from "next/navigation";
import { getCsrfToken } from "@/lib/csrf-client";

const navItems = [
  {
    href: "/admin",
    label: "Command Center",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    href: "/admin/operating-review",
    label: "Operating Review",
    icon: "M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9m-7-4h5m-5 4h8m-8 4h8m-8 4h5",
  },
  {
    href: "/admin/strategy-lead",
    label: "Strategy Lead",
    icon: "M4 6h16M7 12h10M10 18h4",
  },
  {
    href: "/admin/product-lead",
    label: "Product Lead",
    icon: "M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    href: "/admin/growth-lead",
    label: "Growth Lead",
    icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  },
  {
    href: "/admin/tech-lead",
    label: "Tech Lead",
    icon: "M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93s.844.083 1.168-.142l.75-.535a1.14 1.14 0 011.57.165l.773.774c.43.43.501 1.1.165 1.57l-.535.75c-.225.324-.224.772-.142 1.168s.506.71.93.78l.894.15c.542.09.94.56.94 1.109v1.094c0 .55-.398 1.02-.94 1.11l-.894.149c-.424.07-.764.384-.93.78s-.083.844.142 1.168l.535.75a1.14 1.14 0 01-.165 1.57l-.773.773a1.14 1.14 0 01-1.57.165l-.75-.535c-.324-.225-.772-.224-1.168-.142s-.71.506-.78.93l-.15.894c-.09.542-.56.94-1.109.94h-1.094c-.55 0-1.02-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93s-.844-.083-1.168.142l-.75.535a1.14 1.14 0 01-1.57-.165l-.773-.774a1.14 1.14 0 01-.165-1.57l.535-.75c.225-.324.224-.772.142-1.168s-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.148c.424-.071.764-.384.93-.781s.083-.844-.142-1.168l-.535-.75a1.14 1.14 0 01.165-1.57l.774-.773a1.14 1.14 0 011.57-.165l.75.535c.324.225.772.224 1.168.142s.71-.506.78-.93l.15-.894zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    href: "/admin/strategy",
    label: "Strategy Hub",
    icon: "M4 6h16M7 12h10M10 18h4",
  },
  {
    href: "/admin/experiments",
    label: "Experiments",
    icon: "M7 7h10M12 7v10M8 17h8",
  },
];

const analyticsItems = [
  {
    href: "/admin/analytics",
    label: "Core KPIs",
    icon: "M9 19V6l7 13V6m4 13V10m-4 9V3m-8 16V13",
  },
  {
    href: "/admin/funnels",
    label: "Funnels & Cohorts",
    icon: "M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12",
  },
  {
    href: "/admin/comparisons",
    label: "Comparisons",
    icon: "M9 19V6l7 13V6",
  },
  {
    href: "/admin/answers",
    label: "Answer Explorer",
    icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    href: "/admin/pulse",
    label: "Live Pulse",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    href: "/admin/growth",
    label: "Growth",
    icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  },
  {
    href: "/admin/pipeline",
    label: "Conversion Pipeline",
    icon: "M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4",
  },
  {
    href: "/admin/scoring",
    label: "Scoring V4↔V5 (V6Q)",
    icon: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3",
  },
  {
    href: "/admin/reports",
    label: "Report Engagement",
    icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    href: "/admin/revenue",
    label: "Revenue",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    href: "/admin/retention",
    label: "Retention",
    icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  },
  {
    href: "/admin/scorecard",
    label: "Question Scorecard",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  },
  {
    href: "/admin/research",
    label: "Research Intelligence",
    icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z",
  },
  {
    href: "/admin/text-analysis",
    label: "Text Analysis",
    icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z",
  },
  {
    href: "/admin/archetypes",
    label: "Archetypes",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  },
  {
    href: "/admin/journey",
    label: "User Journey",
    icon: "M13 5l7 7-7 7M5 5l7 7-7 7",
  },
  {
    href: "/admin/abandonment",
    label: "Abandonment",
    icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
  },
  {
    href: "/admin/replay",
    label: "Session Replay",
    icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z",
  },
  {
    href: "/admin/profiles",
    label: "User Profiles",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  },
  {
    href: "/admin/question-effectiveness",
    label: "Q Effectiveness",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    href: "/admin/invite-network",
    label: "Invite Network",
    icon: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9",
  },
  {
    href: "/admin/risk-score",
    label: "Risk Score",
    icon: "M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.97l-6.93-12a2 2 0 00-3.5 0l-6.93 12A2 2 0 005.07 19z",
  },
  {
    href: "/admin/language-analytics",
    label: "Language Analytics",
    icon: "M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129",
  },
  {
    href: "/admin/segments",
    label: "Segments",
    icon: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z",
  },
  {
    href: "/admin/predictions",
    label: "Forecasting",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
  {
    href: "/admin/question-lifecycle",
    label: "Q Lifecycle",
    icon: "M4 5h16M6 12h12M9 19h6",
  },
];

const adminItems = [
  {
    href: "/admin/goals",
    label: "Goals",
    icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z",
  },
  {
    href: "/admin/org",
    label: "Org Directory",
    icon: "M4 6h16M4 12h10M4 18h7m9-8h.01M18 18h.01",
  },
  {
    href: "/admin/submissions",
    label: "Submissions",
    icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  },
  {
    href: "/admin/report-builder",
    label: "Report Builder",
    icon: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
  },
  {
    href: "/admin/changelog",
    label: "Changelog",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  {
    href: "/admin/tags",
    label: "Submission Tags",
    icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  },
  {
    href: "/admin/auto-tag-rules",
    label: "Auto-Tag Rules",
    icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  },
  {
    href: "/admin/tools",
    label: "Admin Tools",
    icon: "M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93s.844.083 1.168-.142l.75-.535a1.14 1.14 0 011.57.165l.773.774c.43.43.501 1.1.165 1.57l-.535.75c-.225.324-.224.772-.142 1.168s.506.71.93.78l.894.15c.542.09.94.56.94 1.109v1.094c0 .55-.398 1.02-.94 1.11l-.894.149c-.424.07-.764.384-.93.78s-.083.844.142 1.168l.535.75a1.14 1.14 0 01-.165 1.57l-.773.773a1.14 1.14 0 01-1.57.165l-.75-.535c-.324-.225-.772-.224-1.168-.142s-.71.506-.78.93l-.15.894c-.09.542-.56.94-1.109.94h-1.094c-.55 0-1.02-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93s-.844-.083-1.168.142l-.75.535a1.14 1.14 0 01-1.57-.165l-.773-.774a1.14 1.14 0 01-.165-1.57l.535-.75c.225-.324.224-.772.142-1.168s-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.148c.424-.071.764-.384.93-.781s.083-.844-.142-1.168l-.535-.75a1.14 1.14 0 01.165-1.57l.774-.773a1.14 1.14 0 011.57-.165l.75.535c.324.225.772.224 1.168.142s.71-.506.78-.93l.15-.894zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    href: "/admin/activity",
    label: "Admin Activity",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    href: "/admin/health",
    label: "Data Health",
    icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  },
  {
    href: "/admin/benchmarks",
    label: "Metrics & Benchmarks",
    icon: "M5 17l4-4 4 4 6-6",
  },
];

const dangerItem = {
  href: "/admin/survey-status",
  label: "Survey Status",
  icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
};

interface AdminSidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function AdminSidebar({ open, onClose }: AdminSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  async function handleLogout() {
    await fetch("/api/admin/logout", {
      method: "POST",
      headers: { "x-csrf-token": getCsrfToken() },
    });
    window.location.href = "/admin/login";
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/10 bg-surface transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-6">
          <span className="font-serif text-lg font-semibold text-text-primary">LoveIQ</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Admin
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              <svg
                className="h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={item.icon} />
              </svg>
              {item.label}
            </a>
          ))}

          {/* Analytics section */}
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Analytics
            </p>
            {analyticsItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive(item.href)
                    ? "bg-white/10 text-text-primary"
                    : "text-text-muted hover:bg-white/5 hover:text-text-primary"
                }`}
              >
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon} />
                </svg>
                {item.label}
              </a>
            ))}
          </div>

          {/* Admin section */}
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Admin
            </p>
            {adminItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive(item.href)
                    ? "bg-white/10 text-text-primary"
                    : "text-text-muted hover:bg-white/5 hover:text-text-primary"
                }`}
              >
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon} />
                </svg>
                {item.label}
              </a>
            ))}
          </div>

          {/* Survey Status — separated and styled as danger action */}
          <div className="mt-4 border-t border-white/10 pt-4">
            <a
              href={dangerItem.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                isActive(dangerItem.href)
                  ? "border-red-500/40 bg-red-500/15 text-red-300"
                  : "border-red-500/20 bg-red-500/5 text-red-400/70 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
              }`}
            >
              <svg
                className="h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={dangerItem.icon} />
              </svg>
              {dangerItem.label}
            </a>
          </div>
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-muted transition hover:bg-white/5 hover:text-red-400"
          >
            <svg
              className="h-5 w-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
