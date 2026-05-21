import type { Metadata } from "next";
import AdminToolsDashboard from "@features/admin/ui/AdminToolsDashboard";

export const metadata: Metadata = {
  title: "Admin Tools | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ToolsPage() {
  return <AdminToolsDashboard />;
}
