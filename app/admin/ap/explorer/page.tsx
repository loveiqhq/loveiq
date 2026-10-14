import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApExplorer from "@features/admin/ui/ap/ApExplorer";

export const metadata: Metadata = {
  title: "AP-Analytics · Raw data explorer",
  robots: { index: false, follow: false },
};

export default function ApExplorerPage() {
  return (
    <DashboardErrorBoundary label="The raw data explorer">
      <ApExplorer />
    </DashboardErrorBoundary>
  );
}
