import type { Metadata } from "next";
import FunnelsDashboard from "@features/admin/ui/FunnelsDashboard";

export const metadata: Metadata = {
  title: "Funnels & Cohorts | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function FunnelsPage() {
  return <FunnelsDashboard />;
}
