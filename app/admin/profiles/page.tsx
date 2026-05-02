import type { Metadata } from "next";
import ProfilesDashboard from "@/components/admin/ProfilesDashboard";

export const metadata: Metadata = {
  title: "User Profiles | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ProfilesPage() {
  return <ProfilesDashboard />;
}
