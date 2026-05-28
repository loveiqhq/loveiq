"use client";

import type { FC } from "react";
import ArchetypeBreakdownListSection from "./ArchetypeBreakdownListSection";

interface Props {
  generalHtml: string;
  onUnlock: (archetypeName: string) => void;
  onPurchaseFullReport: () => void;
  percentages: Record<string, number>;
  primaryArchetype: string;
  ranking: string[];
  unlockedArchetypes: Set<string>;
  accessPlan: "essentials" | "full_report" | "all_reports" | null;
}

const ArchetypeProbabilitySection: FC<Props> = ({
  generalHtml,
  onUnlock,
  onPurchaseFullReport,
  percentages,
  primaryArchetype,
  ranking,
  unlockedArchetypes,
  accessPlan,
}) => {
  // generalHtml is server-authored report prose returned by /api/report — never
  // user input. Sanitization lives upstream in features/report/server/contentGating.
  const generalHtmlMarkup = { __html: generalHtml }; // nosemgrep: react-dangerouslysetinnerhtml

  return (
    <div className="report-flow report-flow--gap-xl">
      <div className="report-prose" dangerouslySetInnerHTML={generalHtmlMarkup} />

      <ArchetypeBreakdownListSection
        percentages={percentages}
        primaryArchetype={primaryArchetype}
        ranking={ranking}
        unlockedArchetypes={unlockedArchetypes}
        accessPlan={accessPlan}
        onUnlock={onUnlock}
        onPurchaseFullReport={onPurchaseFullReport}
      />
    </div>
  );
};

export default ArchetypeProbabilitySection;
