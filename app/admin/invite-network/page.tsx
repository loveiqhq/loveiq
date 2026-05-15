import type { Metadata } from "next";
import InviteNetworkDashboard from "@features/admin/ui/InviteNetworkDashboard";

export const metadata: Metadata = {
  title: "Invite Network | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function InviteNetworkPage() {
  return <InviteNetworkDashboard />;
}
