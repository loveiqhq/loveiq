import type { Metadata } from "next";
import CommandCenterDashboard from "@/components/admin/CommandCenterDashboard";

export const metadata: Metadata = {
  title: "Command Center | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <CommandCenterDashboard />;
}
