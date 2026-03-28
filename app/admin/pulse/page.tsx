import type { Metadata } from "next";
import PulseDashboard from "@/components/admin/PulseDashboard";

export const metadata: Metadata = {
  title: "Live Pulse | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function PulsePage() {
  return <PulseDashboard />;
}
