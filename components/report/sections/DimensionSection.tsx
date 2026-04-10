"use client";

import { useState, type FC } from "react";
import PremiumOverlay from "./PremiumOverlay";
import {
  extractReportHtmlBlocks,
  hasMeaningfulReportHtml,
  joinReportHtmlBlocks,
  splitTrailingHeadingBlock,
} from "../reportContent";

interface Props {
  archetype: string;
  archetypeHtml: string | null;
  generalHtml: string;
  isPremium: boolean;
  sectionId: string;
  sectionTitle: string;
}

const RECOMMENDATIONS_PLACEHOLDER_HTML =
  "<p>Recommendations for this archetype are being finalized. Check back soon for tailored resources.</p>";

const DimensionSection: FC<Props> = ({
  archetype,
  archetypeHtml,
  generalHtml,
  isPremium,
  sectionId,
  sectionTitle,
}) => {
  const [unlocked, setUnlocked] = useState(false);
  const rawBlocks = extractReportHtmlBlocks(generalHtml);
  const { bodyBlocks, headingBlock } = splitTrailingHeadingBlock(rawBlocks);

  let introBlocks = bodyBlocks;
  let panelBlocks: string[] = [];

  if (sectionId === "the_loveiq_concept") {
    introBlocks = bodyBlocks.slice(0, 1);
    panelBlocks = bodyBlocks.slice(1);
  } else if (sectionId === "sexual_stage") {
    const stagePanelIndex = bodyBlocks.findIndex((block) =>
      block.includes('class="report-stage-highlight"')
    );

    if (stagePanelIndex > 0) {
      introBlocks = bodyBlocks.slice(0, stagePanelIndex);
      panelBlocks = bodyBlocks.slice(stagePanelIndex);
    }
  }

  const introHtml = joinReportHtmlBlocks(introBlocks);
  const panelHtml = joinReportHtmlBlocks(panelBlocks);
  const archetypeContentStackClassName = headingBlock
    ? "report-flow__stack report-flow__stack--md"
    : "report-flow__stack report-flow__stack--lg";
  const shouldUseRecommendationsFallback =
    sectionId === "recommendations" && !hasMeaningfulReportHtml(archetypeHtml);
  const resolvedArchetypeHtml = shouldUseRecommendationsFallback
    ? RECOMMENDATIONS_PLACEHOLDER_HTML
    : archetypeHtml;

  return (
    <div className="report-flow report-flow--gap-xl">
      {introHtml ? (
        <div
          className={`report-prose ${sectionId === "the_loveiq_concept" ? "report-prose--lead" : ""}`}
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
      ) : null}

      {panelHtml ? (
        <div className="report-prose" dangerouslySetInnerHTML={{ __html: panelHtml }} />
      ) : null}

      {resolvedArchetypeHtml ? (
        <div className={archetypeContentStackClassName}>
          {headingBlock ? (
            <div
              className="report-rich-heading"
              dangerouslySetInnerHTML={{ __html: headingBlock }}
            />
          ) : null}

          <div className="report-themed-block">
            {isPremium && !unlocked ? (
              <div className="report-themed-block__preview">
                <div
                  className="report-prose report-themed-block__blurred"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: resolvedArchetypeHtml }}
                />
                <PremiumOverlay
                  archetype={archetype}
                  sectionTitle={sectionTitle}
                  onUnlock={() => setUnlocked(true)}
                />
              </div>
            ) : (
              <div
                className="report-prose"
                dangerouslySetInnerHTML={{ __html: resolvedArchetypeHtml }}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DimensionSection;
