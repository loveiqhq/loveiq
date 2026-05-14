import { Suspense } from "react";
import type { Metadata } from "next";
import ReportPage from "@features/report/ui/ReportPage";

export const metadata: Metadata = {
  title: "Your Report | LoveIQ",
  description: "Your personalized sexual archetype report based on your survey responses.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportPage />
    </Suspense>
  );
}
