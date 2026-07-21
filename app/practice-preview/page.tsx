// STAGING-ONLY demo route — unlocked, token-free render of the redesigned
// practice-tendencies section so the team can review the new look. 404s on
// production (NEXT_PUBLIC_SITE_URL guard).
//
// Server component ON PURPOSE: the premium data import stays server-side and is
// never shipped in the client JS bundle (see
// __tests__/security/premium-content-bundle.test.ts). Only the one sample
// archetype's content crosses to the client as props — the same shape the real
// report hands its client section after server-side access filtering.
import { notFound } from "next/navigation";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { reportSections } from "@/data/report-general";
import type { ReportPracticeTendencyContentForUser } from "@features/report/ui/hooks/useReportData";
import PracticePreviewClient from "./PracticePreviewClient";

const ARCHETYPE = "Sensual Connector";
const raw = reportPracticeTendencies[ARCHETYPE];
if (!raw) throw new Error(`No practice content for ${ARCHETYPE}`);
const content: ReportPracticeTendencyContentForUser = {
  introBlocks: raw.introBlocks,
  groups: raw.groups.map((g) => ({ title: g.title, rows: g.rows, totalRowCount: g.rows.length })),
};
const generalHtml = reportSections.find((s) => s.sectionNumber === 27)?.generalContent ?? "";

export default async function PracticePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ locked?: string }>;
}) {
  // Staging-only. Never render on production — guards a staging→main merge.
  // NEXT_PUBLIC_SITE_URL is www.loveiq.org on prod, staging.loveiq.org on staging.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (/\/\/(www\.)?loveiq\.org\b/.test(siteUrl) && !siteUrl.includes("staging")) {
    notFound();
  }

  const { locked } = await searchParams; // ?locked=1 → paywalled variant, default unlocked

  return (
    <PracticePreviewClient
      archetype={ARCHETYPE}
      content={content}
      generalHtml={generalHtml}
      locked={locked !== undefined}
    />
  );
}
