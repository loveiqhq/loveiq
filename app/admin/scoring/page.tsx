import type { Metadata } from "next";
import ScoringDashboard from "@features/admin/ui/ScoringDashboard";

export const metadata: Metadata = {
  title: "Scoring V4↔V5 (V6Q) | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ScoringPage() {
  return <ScoringDashboard />;
}
