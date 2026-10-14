import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApSources from "@features/admin/ui/ap/ApSources";

export const metadata: Metadata = {
  title: "AP-Analytics · Data sources",
  robots: { index: false, follow: false },
};

export default function ApSourcesPage() {
  return (
    <DashboardErrorBoundary label="The data catalog">
      <ApSources />
    </DashboardErrorBoundary>
  );
}
