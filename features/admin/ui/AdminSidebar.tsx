"use client";

import { usePathname } from "next/navigation";
import { getCsrfToken } from "@shared/http/csrf-client";

const analyticsItems = [
  {
    href: "/admin/analytics",
    label: "Core KPIs",
    icon: "M9 19V6l7 13V6m4 13V10m-4 9V3m-8 16V13",
  },
  {
    href: "/admin/explorer",
    label: "Data Explorer",
    icon: "M3 4h18M3 4v16h18V4M3 9h18M9 9v11M15 9v11",
  },
  {
    href: "/admin/journey",
    label: "User Journey",
    icon: "M13 5l7 7-7 7M5 5l7 7-7 7",
  },
  {
    href: "/admin/funnels",
    label: "Funnels & Cohorts",
    icon: "M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12",
  },
  {
    href: "/admin/answers",
    label: "Answer Explorer",
    icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];

const adminItems = [
  {
    href: "/admin/submissions",
    label: "Submissions",
    icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
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

  const renderLink = (item: { href: string; label: string; icon: string }) => (
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
  );

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
          {/* Analytics section */}
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Analytics
          </p>
          {analyticsItems.map(renderLink)}

          {/* Admin section */}
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Admin
            </p>
            {adminItems.map(renderLink)}
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
