import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApSurvey from "@features/admin/ui/ap/ApSurvey";

export const metadata: Metadata = {
  title: "AP-Analytics · Survey analytics",
  robots: { index: false, follow: false },
};

export default function ApSurveyPage() {
  return (
    <DashboardErrorBoundary label="The survey page">
      <ApSurvey />
    </DashboardErrorBoundary>
  );
}
