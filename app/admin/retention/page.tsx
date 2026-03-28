import type { Metadata } from "next";
import RetentionDashboard from "@/components/admin/RetentionDashboard";

export const metadata: Metadata = {
  title: "Retention | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function RetentionPage() {
  return <RetentionDashboard />;
}
