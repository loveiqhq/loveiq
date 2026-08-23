import type { Metadata } from "next";

import AbOverviewDashboard from "@features/admin/ui/AbOverviewDashboard";

// Was a bare redirect to /admin/analytics — there was no landing page at all.
// It is now the first screen an admin sees: how the funnel is doing and what the
// A/B tests are saying, in plain language.
export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AbOverviewDashboard />;
}
