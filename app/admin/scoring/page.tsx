import type { Metadata } from "next";
import ScoringDashboard from "@/components/admin/ScoringDashboard";

export const metadata: Metadata = {
  title: "Scoring V4↔V5 | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ScoringPage() {
  return <ScoringDashboard />;
}
