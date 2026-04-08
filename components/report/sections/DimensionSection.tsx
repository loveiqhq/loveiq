"use client";

import { useState, type FC } from "react";
import PremiumOverlay from "./PremiumOverlay";

interface Props {
  archetype: string;
  archetypeHtml: string | null;
  generalHtml: string;
  isPremium: boolean;
  sectionTitle: string;
}

const DimensionSection: FC<Props> = ({
  archetype,
  archetypeHtml,
  generalHtml,
  isPremium,
  sectionTitle,
}) => {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <div className="space-y-10">
      <div className="report-prose" dangerouslySetInnerHTML={{ __html: generalHtml }} />

      {archetypeHtml ? (
        <div className="report-themed-block">
          {isPremium && !unlocked ? (
            <div className="report-themed-block__preview">
              <div
                className="report-prose report-themed-block__blurred"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: archetypeHtml }}
              />
              <PremiumOverlay
                archetype={archetype}
                sectionTitle={sectionTitle}
                onUnlock={() => setUnlocked(true)}
              />
            </div>
          ) : (
            <div className="report-prose" dangerouslySetInnerHTML={{ __html: archetypeHtml }} />
          )}
        </div>
      ) : null}
    </div>
  );
};

export default DimensionSection;
