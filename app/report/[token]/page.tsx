import { Suspense } from "react";
import type { Metadata } from "next";
import ReportPage from "@features/report/ui/ReportPage";

export const metadata: Metadata = {
  title: "Your Report | LoveIQ",
  description: "Your personalized sexual archetype report based on your survey responses.",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function Page({ params }: Props) {
  const { token } = await params;
  // `?v3=1` selects the mobile-first V3 chrome; ReportPage reads it from the
  // client-side search params, so no branching is needed here.
  return (
    <Suspense fallback={null}>
      <ReportPage token={token} />
    </Suspense>
  );
}
