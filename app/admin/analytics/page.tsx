import type { Metadata } from "next";
import CoreKpiDashboard from "@features/admin/ui/CoreKpiDashboard";

export const metadata: Metadata = {
  title: "Core KPIs | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function AdminAnalyticsPage() {
  return <CoreKpiDashboard />;
}
