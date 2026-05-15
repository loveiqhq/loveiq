import type { Metadata } from "next";
import ReplayDashboard from "@features/admin/ui/ReplayDashboard";

export const metadata: Metadata = {
  title: "Session Replay | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ReplayPage() {
  return <ReplayDashboard />;
}
