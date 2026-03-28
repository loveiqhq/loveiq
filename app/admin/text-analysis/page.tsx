import type { Metadata } from "next";
import TextAnalysisDashboard from "@/components/admin/TextAnalysisDashboard";

export const metadata: Metadata = {
  title: "Text Analysis | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function TextAnalysisPage() {
  return <TextAnalysisDashboard />;
}
