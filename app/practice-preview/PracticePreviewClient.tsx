// Client wrapper for the staging-only practice preview. Receives the sample
// content as props (NO premium-data module import here — that stays server-side
// in page.tsx). Mounts the section client-only via next/dynamic so there's no
// SSR hydration flash on the fade-in, mirroring the real report.
"use client";

import dynamic from "next/dynamic";
import type { ReportPracticeTendencyContentForUser } from "@features/report/ui/hooks/useReportData";

const PracticeTendenciesSection = dynamic(
  () => import("@features/report/ui/sections/PracticeTendenciesSection"),
  { ssr: false }
);

export default function PracticePreviewClient({
  archetype,
  content,
  locked,
}: {
  archetype: string;
  content: ReportPracticeTendencyContentForUser;
  locked: boolean;
}) {
  return (
    <div className="report-page" style={{ background: "#ffffff", minHeight: "100vh" }}>
      <div className="content-shell" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <PracticeTendenciesSection
          archetype={archetype}
          content={content}
          isPremium={locked}
          isUnlocked={false}
          sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
        />
      </div>
    </div>
  );
}
