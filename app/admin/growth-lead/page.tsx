import type { Metadata } from "next";
import RoleCockpitDashboard from "@features/admin/ui/RoleCockpitDashboard";

export const metadata: Metadata = {
  title: "Growth Lead | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function GrowthLeadPage() {
  return <RoleCockpitDashboard role="growth" />;
}
