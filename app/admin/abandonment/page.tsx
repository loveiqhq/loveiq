import type { Metadata } from "next";
import AbandonmentDashboard from "@features/admin/ui/AbandonmentDashboard";

export const metadata: Metadata = {
  title: "Abandonment Recovery | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function AbandonmentPage() {
  return <AbandonmentDashboard />;
}
