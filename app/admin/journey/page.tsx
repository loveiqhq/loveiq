import type { Metadata } from "next";
import JourneyDashboard from "@/components/admin/JourneyDashboard";

export const metadata: Metadata = {
  title: "User Journey | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function JourneyPage() {
  return <JourneyDashboard />;
}
