import type { Metadata } from "next";
import LanguageAnalyticsDashboard from "@features/admin/ui/LanguageAnalyticsDashboard";

export const metadata: Metadata = {
  title: "Language Analytics | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function LanguageAnalyticsPage() {
  return <LanguageAnalyticsDashboard />;
}
