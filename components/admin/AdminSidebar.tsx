"use client";

import { usePathname } from "next/navigation";
import { getCsrfToken } from "@/lib/csrf-client";

const navItems = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    href: "/admin/submissions",
    label: "Submissions",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    href: "/admin/product-kpis",
    label: "Product KPIs",
    icon: "M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
];

const analyticsItems = [
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
];

const adminItems = [
  {
    href: "/admin/tools",
    label: "Admin Tools",
    icon: "M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93s.844.083 1.168-.142l.75-.535a1.14 1.14 0 011.57.165l.773.774c.43.43.501 1.1.165 1.57l-.535.75c-.225.324-.224.772-.142 1.168s.506.71.93.78l.894.15c.542.09.94.56.94 1.109v1.094c0 .55-.398 1.02-.94 1.11l-.894.149c-.424.07-.764.384-.93.78s-.083.844.142 1.168l.535.75a1.14 1.14 0 01-.165 1.57l-.773.773a1.14 1.14 0 01-1.57.165l-.75-.535c-.324-.225-.772-.224-1.168-.142s-.71.506-.78.93l-.15.894c-.09.542-.56.94-1.109.94h-1.094c-.55 0-1.02-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93s-.844-.083-1.168.142l-.75.535a1.14 1.14 0 01-1.57-.165l-.773-.774a1.14 1.14 0 01-.165-1.57l.535-.75c.225-.324.224-.772.142-1.168s-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.148c.424-.071.764-.384.93-.781s.083-.844-.142-1.168l-.535-.75a1.14 1.14 0 01.165-1.57l.774-.773a1.14 1.14 0 011.57-.165l.75.535c.324.225.772.224 1.168.142s.71-.506.78-.93l.15-.894zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
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

        <nav className="flex-1 space-y-1 px-3 py-4">
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
