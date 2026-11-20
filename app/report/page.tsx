import { Suspense } from "react";
import type { Metadata } from "next";
import ReportPage from "@features/report/ui/ReportPage";
import { preloadReportFont } from "@/app/report/preloadReportFont";
import { PRIVATE_PAGE_METADATA } from "@shared/seo/private-page";

export const metadata: Metadata = {
  title: "Your Report | LoveIQ",
  description: "Your personalized sexual archetype report based on your survey responses.",
  ...PRIVATE_PAGE_METADATA,
};

export default function Page() {
  preloadReportFont();
  return (
    <Suspense fallback={null}>
      <ReportPage />
    </Suspense>
  );
}
