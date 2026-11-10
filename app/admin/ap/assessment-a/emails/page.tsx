import type { Metadata } from "next";

import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";
import ApEmails from "@features/admin/ui/ap/ApEmails";

export const metadata: Metadata = {
  title: "AP-Analytics · Assessment A · Emails",
  robots: { index: false, follow: false },
};

export default function ApAssessmentEmailsPage() {
  return (
    <DashboardErrorBoundary label="The emails page">
      <ApEmails scope="assessment" />
    </DashboardErrorBoundary>
  );
}
