import type { Metadata } from "next";
import StrategyHubDashboard from "@features/admin/ui/StrategyHubDashboard";

export const metadata: Metadata = {
  title: "Strategy Hub | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function StrategyHubPage() {
  return <StrategyHubDashboard />;
}
