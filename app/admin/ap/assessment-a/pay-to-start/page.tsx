import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApPayToStart from "@features/admin/ui/ap/ApPayToStart";

export const metadata: Metadata = {
  title: "AP-Analytics · Assessment A · Funnel and paywall",
  robots: { index: false, follow: false },
};

export default function ApPayToStartPage() {
  return (
    <DashboardErrorBoundary label="The funnel and paywall page">
      <ApPayToStart />
    </DashboardErrorBoundary>
  );
}
