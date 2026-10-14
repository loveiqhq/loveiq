import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApDashboard from "@features/admin/ui/ap/ApDashboard";

export const metadata: Metadata = {
  title: "AP-Analytics · Assessment A",
  robots: { index: false, follow: false },
};

export default function ApAssessmentPage() {
  return (
    <DashboardErrorBoundary label="The Assessment A dashboard">
      <ApDashboard />
    </DashboardErrorBoundary>
  );
}
