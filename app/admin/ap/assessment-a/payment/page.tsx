import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApPayment from "@features/admin/ui/ap/ApPayment";

export const metadata: Metadata = {
  title: "AP-Analytics · Assessment A · Payment",
  robots: { index: false, follow: false },
};

export default function ApPaymentPage() {
  return (
    <DashboardErrorBoundary label="The payment page">
      <ApPayment />
    </DashboardErrorBoundary>
  );
}
