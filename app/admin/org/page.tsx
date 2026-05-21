import type { Metadata } from "next";
import OrgAdminDirectory from "@features/admin/ui/OrgAdminDirectory";

export const metadata: Metadata = {
  title: "Org Directory | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function OrgAdminDirectoryPage() {
  return <OrgAdminDirectory />;
}
