import type { Metadata } from "next";
import RoleCockpitDashboard from "@/components/admin/RoleCockpitDashboard";

export const metadata: Metadata = {
  title: "Product Lead | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ProductLeadPage() {
  return <RoleCockpitDashboard role="product" />;
}
