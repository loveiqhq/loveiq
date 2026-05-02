import type { Metadata } from "next";
import TagsDashboard from "@/components/admin/TagsDashboard";

export const metadata: Metadata = {
  title: "Submission Tags | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function TagsPage() {
  return <TagsDashboard />;
}
