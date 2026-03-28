import type { Metadata } from "next";
import RevenueDashboard from "@/components/admin/RevenueDashboard";

export const metadata: Metadata = {
  title: "Revenue | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function RevenuePage() {
  return <RevenueDashboard />;
}
