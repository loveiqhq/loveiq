import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApUnlockFeedback from "@features/admin/ui/ap/ApUnlockFeedback";

export const metadata: Metadata = {
  title: "AP-Analytics · Assessment A · Unlock feedback",
  robots: { index: false, follow: false },
};

export default function ApUnlockFeedbackPage() {
  return (
    <DashboardErrorBoundary label="The unlock feedback page">
      <ApUnlockFeedback />
    </DashboardErrorBoundary>
  );
}
