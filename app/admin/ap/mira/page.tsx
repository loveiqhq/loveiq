import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApMira from "@features/admin/ui/ap/ApMira";

export const metadata: Metadata = {
  title: "AP-Analytics · Mira (beta)",
  robots: { index: false, follow: false },
};

export default function ApMiraPage() {
  return (
    <DashboardErrorBoundary label="The Mira page">
      <ApMira />
    </DashboardErrorBoundary>
  );
}
