import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApLanding from "@features/admin/ui/ap/ApLanding";

export const metadata: Metadata = {
  title: "AP-Analytics · Landing page and assessment page",
  robots: { index: false, follow: false },
};

export default function ApLandingPage() {
  return (
    <DashboardErrorBoundary label="The landing page report">
      <ApLanding />
    </DashboardErrorBoundary>
  );
}
