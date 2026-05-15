import type { Metadata } from "next";
import RetentionDashboard from "@features/admin/ui/RetentionDashboard";

export const metadata: Metadata = {
  title: "Retention | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function RetentionPage() {
  return <RetentionDashboard />;
}
