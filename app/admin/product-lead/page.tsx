import type { Metadata } from "next";
import RoleCockpitDashboard from "@features/admin/ui/RoleCockpitDashboard";

export const metadata: Metadata = {
  title: "Product Lead | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ProductLeadPage() {
  return <RoleCockpitDashboard role="product" />;
}
