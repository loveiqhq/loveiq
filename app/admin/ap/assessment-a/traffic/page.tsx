import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApTraffic from "@features/admin/ui/ap/ApTraffic";

export const metadata: Metadata = {
  title: "AP-Analytics · Traffic",
  robots: { index: false, follow: false },
};

export default function ApTrafficPage() {
  return (
    <DashboardErrorBoundary label="The traffic page">
      <ApTraffic />
    </DashboardErrorBoundary>
  );
}
