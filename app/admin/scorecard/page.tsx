import type { Metadata } from "next";
import ScorecardDashboard from "@features/admin/ui/ScorecardDashboard";

export const metadata: Metadata = {
  title: "Question Scorecard | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ScorecardPage() {
  return <ScorecardDashboard />;
}
