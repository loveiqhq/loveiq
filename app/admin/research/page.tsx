import type { Metadata } from "next";
import ResearchIntelligenceDashboard from "@features/admin/ui/ResearchIntelligenceDashboard";

export const metadata: Metadata = {
  title: "Research Intelligence | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ResearchPage() {
  return <ResearchIntelligenceDashboard />;
}
