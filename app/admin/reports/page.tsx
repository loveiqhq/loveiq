import type { Metadata } from "next";
import ReportsDashboard from "@/components/admin/ReportsDashboard";

export const metadata: Metadata = {
  title: "Report Engagement | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ReportsPage() {
  return <ReportsDashboard />;
}
