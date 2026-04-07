import type { Metadata } from "next";
import ReportPage from "@/components/report/ReportPage";

export const metadata: Metadata = {
  title: "Your Report | LoveIQ",
  description: "Your personalized sexual archetype report based on your survey responses.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ReportPage />;
}
