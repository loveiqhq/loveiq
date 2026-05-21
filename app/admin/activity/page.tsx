import type { Metadata } from "next";
import ActivityDashboard from "@features/admin/ui/ActivityDashboard";

export const metadata: Metadata = {
  title: "Admin Activity | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ActivityPage() {
  return <ActivityDashboard />;
}
