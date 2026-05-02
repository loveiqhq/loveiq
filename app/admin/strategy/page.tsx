import type { Metadata } from "next";
import StrategyHubDashboard from "@/components/admin/StrategyHubDashboard";

export const metadata: Metadata = {
  title: "Strategy Hub | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function StrategyHubPage() {
  return <StrategyHubDashboard />;
}
