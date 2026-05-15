import type { Metadata } from "next";
import GrowthDashboard from "@features/admin/ui/GrowthDashboard";

export const metadata: Metadata = {
  title: "Growth | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function GrowthPage() {
  return <GrowthDashboard />;
}
