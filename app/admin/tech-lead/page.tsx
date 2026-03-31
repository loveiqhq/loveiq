import type { Metadata } from "next";
import RoleCockpitDashboard from "@/components/admin/RoleCockpitDashboard";

export const metadata: Metadata = {
  title: "Tech Lead | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function TechLeadPage() {
  return <RoleCockpitDashboard role="tech" />;
}
