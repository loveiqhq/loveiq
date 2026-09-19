import type { Metadata } from "next";

import AbOverviewDashboard from "@features/admin/ui/AbOverviewDashboard";
import DashboardErrorBoundary from "@features/admin/ui/DashboardErrorBoundary";

// Was a bare redirect to /admin/analytics — there was no landing page at all.
// It is now the first screen an admin sees: how the funnel is doing and what the
// A/B tests are saying, in plain language.
export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  // Scoped so a throw in here cannot blank the whole admin panel — and so the
  // message is visible on the page instead of being swallowed by the app-wide
  // "Something went wrong" screen.
  return (
    <DashboardErrorBoundary label="The overview dashboard">
      <AbOverviewDashboard />
    </DashboardErrorBoundary>
  );
}
