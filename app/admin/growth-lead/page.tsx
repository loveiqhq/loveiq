import type { Metadata } from "next";
import RoleCockpitDashboard from "@/components/admin/RoleCockpitDashboard";

export const metadata: Metadata = {
  title: "Growth Lead | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function GrowthLeadPage() {
  return <RoleCockpitDashboard role="growth" />;
}
