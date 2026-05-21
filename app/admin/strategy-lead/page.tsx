import type { Metadata } from "next";
import RoleCockpitDashboard from "@features/admin/ui/RoleCockpitDashboard";

export const metadata: Metadata = {
  title: "Strategy Lead | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function StrategyLeadPage() {
  return <RoleCockpitDashboard role="strategy" />;
}
