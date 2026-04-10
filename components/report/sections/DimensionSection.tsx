"use client";

import { useState, type FC } from "react";
import PremiumOverlay from "./PremiumOverlay";
import {
  extractReportHtmlBlocks,
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
  let panelClassName = "report-flow__panel report-flow__panel--centered";
  let panelStackClassName = "report-flow__stack report-flow__stack--lg";

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
  } else if (archetypeHtml && bodyBlocks.length >= 8) {
    introBlocks = bodyBlocks.slice(0, 3);
    panelBlocks = bodyBlocks.slice(3);
    panelClassName = "report-flow__panel report-flow__panel--editorial";
    panelStackClassName = "report-flow__stack report-flow__stack--md";
  }

  const introHtml = joinReportHtmlBlocks(introBlocks);
  const panelHtml = joinReportHtmlBlocks(panelBlocks);
  const archetypePanelStackClassName = headingBlock
    ? "report-flow__stack report-flow__stack--md"
    : "report-flow__stack report-flow__stack--lg";

  return (
    <div className="report-flow report-flow--gap-xl">
      {introHtml ? (
        <div
          className={`report-prose ${sectionId === "the_loveiq_concept" ? "report-prose--lead" : ""}`}
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
      ) : null}

      {panelHtml ? (
        <div className={panelClassName}>
          <div
            className={`${panelStackClassName} ${panelClassName.includes("editorial") ? "report-flow__stack--stretch" : ""}`}
          >
            <div className="report-prose" dangerouslySetInnerHTML={{ __html: panelHtml }} />
          </div>
        </div>
      ) : null}

      {archetypeHtml ? (
        <div className="report-flow__panel report-flow__panel--centered">
          <div className={archetypePanelStackClassName}>
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
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DimensionSection;
