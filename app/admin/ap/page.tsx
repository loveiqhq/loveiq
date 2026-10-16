import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApFocus from "@features/admin/ui/ap/ApFocus";

export const metadata: Metadata = {
  title: "AP-Analytics · Dashboard",
  robots: { index: false, follow: false },
};

export default function ApDashboardPage() {
  return (
    <DashboardErrorBoundary label="The dashboard">
      <ApFocus />
    </DashboardErrorBoundary>
  );
}
