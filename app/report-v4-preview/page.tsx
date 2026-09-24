// STAGING-ONLY preview route — a token-free, database-free render of the whole
// Report V4 mobile frame (Figma 1:165) so the team can check it against Figma.
// 404s on production (NEXT_PUBLIC_SITE_URL guard), exactly as
// app/practice-preview/page.tsx does.
//
// Nothing here is wired into the real report: ReportPage.tsx imports none of these
// components, so this page is the only thing that renders them today.
import { notFound } from "next/navigation";
import { report3ArchetypeCard } from "@/data/report3-archetype-card";
import {
  REPORT_V4_PART3_CHAPTERS,
  REPORT_V4_PART4_CHAPTERS,
  REPORT_V4_PART5_CHAPTERS,
  REPORT_V4_PART6_CHAPTERS,
} from "@/data/report3-archetype-page";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import { buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import { buildAccelerators } from "@/data/report3-accelerators";
import { isReportPurchasePlan, type ReportAccessPlan } from "@features/report/server/access";
import {
  buildLearnMoreForReader,
  isLearnMoreArticleLocked,
} from "@features/report/server/contentGating";
import { buildPreviewQuotes } from "./previewQuotes";
import ReportV4PreviewClient from "./ReportV4PreviewClient";

const ARCHETYPE = "Spark Seeker";

/** The frame draws Spark Seeker at 43% — a 138.875px fill in a 323px track. */
const MATCH_STRENGTH = 43;

const ALL_CHAPTERS = [
  ...REPORT_V4_PART3_CHAPTERS,
  ...REPORT_V4_PART4_CHAPTERS,
  ...REPORT_V4_PART5_CHAPTERS,
  ...REPORT_V4_PART6_CHAPTERS,
];

export default async function ReportV4PreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Staging-only. Never render on production — guards a staging→main merge.
  // NEXT_PUBLIC_SITE_URL is www.loveiq.org on prod, staging.loveiq.org on staging.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (/\/\/(www\.)?loveiq\.org\b/.test(siteUrl) && !siteUrl.includes("staging")) {
    notFound();
  }

  const copy = report3ArchetypeCard[ARCHETYPE];
  if (!copy) throw new Error(`No Report V4 card copy for ${ARCHETYPE}`);

  // `?plan=` simulates a reader so all three states of the learn-more article are
  // checkable: no plan shows 153:2280 (the paywall), any paid plan shows 153:2260.
  // It is a query param rather than a control inside the 393px canvas so the report
  // column stays exactly as the frame draws it.
  const raw = (await searchParams).plan;
  const planParam = typeof raw === "string" ? raw : "";
  const accessPlan: ReportAccessPlan = isReportPurchasePlan(planParam) ? planParam : null;

  // Built here, on the server, so the gate is decided before anything reaches the
  // browser — and so a locked reader's payload has already been stripped.
  const learnMore = buildLearnMoreForReader({
    chapters: ALL_CHAPTERS,
    articles: REPORT_V4_LEARN_MORE,
    accessPlan,
  });

  return (
    <ReportV4PreviewClient
      archetype={ARCHETYPE}
      matchStrength={MATCH_STRENGTH}
      copy={copy}
      learnMore={learnMore}
      accessPlan={accessPlan}
      accessPlanLabel={accessPlan ?? "no purchase"}
      quotes={buildPreviewQuotes()}
      typicalBeliefs={buildTypicalBeliefs(ARCHETYPE, {
        // The same gate the article runs through, so the chapter body and the
        // "Go deeper" card below it can never disagree about who has paid.
        locked: isLearnMoreArticleLocked({
          article: { chapterId: "typical_beliefs" },
          accessPlan,
        }),
      })}
      accelerators={buildAccelerators(ARCHETYPE, {
        locked: isLearnMoreArticleLocked({
          article: { chapterId: "typical_arousal_accelerators_turn_ons_of_the_core_archetype" },
          accessPlan,
        }),
      })}
    />
  );
}
