import type { Metadata } from "next";
import ChangelogDashboard from "@/components/admin/ChangelogDashboard";

export const metadata: Metadata = {
  title: "Product Changelog | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ChangelogPage() {
  return <ChangelogDashboard />;
}
