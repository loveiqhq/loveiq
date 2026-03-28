import type { Metadata } from "next";
import AbandonmentDashboard from "@/components/admin/AbandonmentDashboard";

export const metadata: Metadata = {
  title: "Abandonment Recovery | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function AbandonmentPage() {
  return <AbandonmentDashboard />;
}
