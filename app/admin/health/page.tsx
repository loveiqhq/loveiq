import type { Metadata } from "next";
import HealthDashboard from "@/components/admin/HealthDashboard";

export const metadata: Metadata = {
  title: "Data Health | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function HealthPage() {
  return <HealthDashboard />;
}
