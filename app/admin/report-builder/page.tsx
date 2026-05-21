import type { Metadata } from "next";
import ReportBuilder from "@features/admin/ui/ReportBuilder";

export const metadata: Metadata = {
  title: "Report Builder | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ReportBuilderPage() {
  return <ReportBuilder />;
}
