import type { Metadata } from "next";
import OperatingReviewDashboard from "@/components/admin/OperatingReviewDashboard";

export const metadata: Metadata = {
  title: "Operating Review | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function OperatingReviewPage() {
  return <OperatingReviewDashboard />;
}
