import type { Metadata } from "next";
import HealthDashboard from "@features/admin/ui/HealthDashboard";

export const metadata: Metadata = {
  title: "Data Health | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function HealthPage() {
  return <HealthDashboard />;
}
