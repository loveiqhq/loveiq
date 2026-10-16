import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApReport from "@features/admin/ui/ap/ApReport";

export const metadata: Metadata = {
  title: "AP-Analytics · Report",
  robots: { index: false, follow: false },
};

export default function ApReportPage() {
  return (
    <DashboardErrorBoundary label="The report page">
      <ApReport />
    </DashboardErrorBoundary>
  );
}
