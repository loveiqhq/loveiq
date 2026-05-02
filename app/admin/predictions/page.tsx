import type { Metadata } from "next";
import PredictiveInsights from "@/components/admin/PredictiveInsights";

export const metadata: Metadata = {
  title: "Predictions | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function PredictionsPage() {
  return <PredictiveInsights />;
}
