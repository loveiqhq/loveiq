import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApOverview from "@features/admin/ui/ap/ApOverview";

export const metadata: Metadata = {
  title: "AP-Analytics · Overview",
  robots: { index: false, follow: false },
};

export default function ApOverviewPage() {
  return (
    <DashboardErrorBoundary label="The overview">
      <ApOverview />
    </DashboardErrorBoundary>
  );
}
