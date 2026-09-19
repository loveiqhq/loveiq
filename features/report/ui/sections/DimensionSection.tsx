"use client";

import type { FC } from "react";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import {
  ensureSexualStageHighlight,
  extractReportHtmlBlocks,
  hasMeaningfulReportHtml,
  joinReportHtmlBlocks,
  normalizeReportHtml,
  splitTrailingHeadingBlock,
} from "../reportContent";

interface Props {
  archetype: string;
  archetypeHtml: string | null;
  generalHtml: string;
  isPremium: boolean;
  isStageValueLocked?: boolean;
  isUnlocked?: boolean;
  onUnlock?: () => void;
  quote?: ReportPriceQuoteSnapshot | null;
  sectionId: string;
  sectionTitle: string;
  tier?: PremiumOverlayTier;
}

const RECOMMENDATIONS_PLACEHOLDER_HTML =
  "<p>Recommendations for this archetype are being finalized. Check back soon for tailored resources.</p>";

const DimensionSection: FC<Props> = ({
  archetype,
  archetypeHtml,
  generalHtml,
  isPremium,
  isStageValueLocked = false,
  isUnlocked = false,
  onUnlock,
  quote = null,
  sectionId,
  sectionTitle,
  tier = "full_report",
}) => {
  const unlocked = isUnlocked;
  const normalizedGeneralHtml =
    sectionId === "sexual_stage"
      ? ensureSexualStageHighlight(generalHtml, { isLocked: isStageValueLocked })
      : generalHtml;
  const rawBlocks = extractReportHtmlBlocks(normalizedGeneralHtml);
  const { bodyBlocks, headingBlock } = splitTrailingHeadingBlock(rawBlocks);

  let introBlocks = bodyBlocks;
  let panelBlocks: string[] = [];

  if (sectionId === "sexual_stage") {
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
  const normalizedArchetypeHtml = normalizeReportHtml(resolvedArchetypeHtml);

  // Premium sections without an archetype-specific block (e.g. "Arousal,
  // Desire & Pleasure", "About Fantasies", "Living Fantasies") store their
  // body in `generalContent`. When locked we move that body INTO the blurred
  // slot so the PremiumOverlay has a sized parent to anchor against and the
  // user sees a consistent tease pattern across all premium chapters.
  const isLocked = isPremium && !unlocked;
  const lockedBodyComesFromIntro = isLocked && !normalizedArchetypeHtml && !!introHtml;
  const blurredBodyHtml = lockedBodyComesFromIntro ? introHtml : normalizedArchetypeHtml;
  const showVisibleIntro = !lockedBodyComesFromIntro && !!introHtml;
  const showVisiblePanel = !lockedBodyComesFromIntro && !!panelHtml;

  // Teaser: show first block unblurred; blur the rest. Fall back to full-blur
  // when there is only one block (no meaningful tease possible).
  const blurredBlocks = isLocked ? extractReportHtmlBlocks(blurredBodyHtml ?? "") : [];
  const hasTeaserSplit = blurredBlocks.length >= 4;
  const teaserBlock = hasTeaserSplit ? blurredBlocks[0] : null;
  const remainingBlurHtml = hasTeaserSplit
    ? joinReportHtmlBlocks(blurredBlocks.slice(1))
    : blurredBodyHtml;

  function handleUnlock() {
    onUnlock?.();
  }

  return (
    <div className="report-flow report-flow--gap-xl">
      {showVisibleIntro ? (
        <div
          className={`report-prose ${sectionId === "the_loveiq_concept" ? "report-prose--lead" : ""}`}
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
      ) : null}

      {showVisiblePanel ? (
        <div className="report-prose" dangerouslySetInnerHTML={{ __html: panelHtml }} />
      ) : null}

      {blurredBodyHtml || (isPremium && !unlocked) ? (
        <div className={archetypeContentStackClassName}>
          {headingBlock ? (
            <div
              className="report-rich-heading"
              dangerouslySetInnerHTML={{ __html: headingBlock }}
            />
          ) : null}

          <div className="report-themed-block">
            {isLocked ? (
              <>
                {teaserBlock ? (
                  <div
                    className="report-prose report-themed-block__teaser"
                    dangerouslySetInnerHTML={{ __html: teaserBlock }}
                  />
                ) : null}
                <div className="report-themed-block__preview report-themed-block__preview--locked report-themed-block__preview--has-teaser">
                  {remainingBlurHtml ? (
                    <div
                      className="report-prose report-themed-block__blurred"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: remainingBlurHtml }}
                    />
                  ) : null}
                  <PremiumOverlay
                    archetype={archetype}
                    sectionTitle={sectionTitle}
                    tier={tier}
                    quote={quote}
                    onUnlock={handleUnlock}
                  />
                </div>
              </>
            ) : normalizedArchetypeHtml ? (
              <div
                className="report-prose"
                dangerouslySetInnerHTML={{ __html: normalizedArchetypeHtml }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DimensionSection;
