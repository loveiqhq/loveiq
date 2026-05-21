import type { Metadata } from "next";
import RiskScoreDashboard from "@features/admin/ui/RiskScoreDashboard";

export const metadata: Metadata = {
  title: "Predictive Risk Score | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function RiskScorePage() {
  return <RiskScoreDashboard />;
}
