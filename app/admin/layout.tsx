"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";

const pageTitles: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/submissions": "Submissions",
  "/admin/survey-status": "Survey Status",
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
