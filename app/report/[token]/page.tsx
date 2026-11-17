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

interface Props {
  params: Promise<{ token: string }>;
}

export default async function Page({ params }: Props) {
  preloadReportFont();
  const { token } = await params;
  // `?v3=1` selects the mobile-first V3 chrome; ReportPage reads it from the
  // client-side search params, so no branching is needed here.
  return (
    <Suspense fallback={null}>
      <ReportPage token={token} />
    </Suspense>
  );
}
