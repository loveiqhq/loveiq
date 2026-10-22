import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApPayToStart from "@features/admin/ui/ap/ApPayToStart";

export const metadata: Metadata = {
  title: "AP-Analytics · Assessment A · Pay to start",
  robots: { index: false, follow: false },
};

export default function ApPayToStartPage() {
  return (
    <DashboardErrorBoundary label="The pay-to-start page">
      <ApPayToStart />
    </DashboardErrorBoundary>
  );
}
