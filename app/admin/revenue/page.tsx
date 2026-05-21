import type { Metadata } from "next";
import RevenueDashboard from "@features/admin/ui/RevenueDashboard";

export const metadata: Metadata = {
  title: "Revenue | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function RevenuePage() {
  return <RevenueDashboard />;
}
