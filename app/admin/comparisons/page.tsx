import type { Metadata } from "next";
import ComparisonsDashboard from "@/components/admin/ComparisonsDashboard";

export const metadata: Metadata = {
  title: "Comparisons | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ComparisonsPage() {
  return <ComparisonsDashboard />;
}
