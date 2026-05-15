import type { Metadata } from "next";
import OperatingReviewDashboard from "@features/admin/ui/OperatingReviewDashboard";

export const metadata: Metadata = {
  title: "Operating Review | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function OperatingReviewPage() {
  return <OperatingReviewDashboard />;
}
