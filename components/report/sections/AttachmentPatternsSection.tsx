"use client";

import { useState, type FC } from "react";
import PremiumOverlay from "./PremiumOverlay";
import {
  extractAttachmentSectionContent,
  normalizeReportHtml,
  type ReportAttachmentPattern,
} from "../reportContent";

interface Props {
  archetype: string;
  archetypeHtml: string | null;
  generalHtml: string;
  isPremium: boolean;
  isUnlocked?: boolean;
  onUnlock?: () => void;
  sectionTitle: string;
}

const ATTACHMENT_TONE_BY_TITLE: Record<string, string> = {
  "anxious attachment": "anxious",
  "avoidant attachment": "avoidant",
  "contextual / adaptive attachment": "adaptive",
  "disorganized or mixed attachment": "mixed",
  "secure attachment": "secure",
};

function getAttachmentTone(pattern: ReportAttachmentPattern) {
  return ATTACHMENT_TONE_BY_TITLE[pattern.title.toLowerCase()] ?? "default";
}

const AttachmentPatternsSection: FC<Props> = ({
  archetype,
  archetypeHtml,
  generalHtml,
  isPremium,
  isUnlocked = false,
  onUnlock,
  sectionTitle,
}) => {
  const [locallyUnlocked, setLocallyUnlocked] = useState(false);
  const unlocked = isUnlocked || locallyUnlocked;
  const { introHtml, commonHeading, patterns, outroHtml, headingBlock } =
    extractAttachmentSectionContent(generalHtml);
  const archetypeContentStackClassName = headingBlock
    ? "report-flow__stack report-flow__stack--md"
    : "report-flow__stack report-flow__stack--lg";
  const normalizedArchetypeHtml = normalizeReportHtml(archetypeHtml);

  function handleUnlock() {
    if (onUnlock) {
      onUnlock();
      return;
    }

    setLocallyUnlocked(true);
  }

  return (
    <div className="report-flow report-flow--gap-xl">
      {introHtml ? (
        <div className="report-prose" dangerouslySetInnerHTML={{ __html: introHtml }} />
      ) : null}

      {commonHeading || patterns.length > 0 || outroHtml ? (
        <section className="report-attachment-patterns">
          {commonHeading ? (
            <div className="report-attachment-patterns__header">
              <h3 className="report-attachment-patterns__title">{commonHeading}</h3>
            </div>
          ) : null}

          {patterns.length > 0 ? (
            <div className="report-attachment-patterns__grid">
              {patterns.map((pattern) => (
                <article
                  key={pattern.title}
                  className="report-attachment-patterns__card"
                  data-tone={getAttachmentTone(pattern)}
                >
                  <div className="report-attachment-patterns__card-accent" aria-hidden="true" />
                  <div className="report-attachment-patterns__card-copy">
                    <h4 className="report-attachment-patterns__card-title">{pattern.title}</h4>
                    {pattern.descriptionHtml ? (
                      <div
                        className="report-attachment-patterns__card-body"
                        dangerouslySetInnerHTML={{ __html: pattern.descriptionHtml }}
                      />
                    ) : null}
                  </div>

                  {pattern.examples.length > 0 ? (
                    <p className="report-attachment-patterns__examples">
                      <span className="report-attachment-patterns__examples-label">
                        Often seen in
                      </span>
                      <span className="report-attachment-patterns__examples-copy">
                        {pattern.examples.join(", ")}
                      </span>
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          {outroHtml ? (
            <div
              className="report-prose report-attachment-patterns__outro"
              dangerouslySetInnerHTML={{ __html: outroHtml }}
            />
          ) : null}
        </section>
      ) : null}

      {normalizedArchetypeHtml ? (
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
                  dangerouslySetInnerHTML={{ __html: normalizedArchetypeHtml }}
                />
                <PremiumOverlay
                  archetype={archetype}
                  sectionTitle={sectionTitle}
                  onUnlock={handleUnlock}
                />
              </div>
            ) : (
              <div
                className="report-prose"
                dangerouslySetInnerHTML={{ __html: normalizedArchetypeHtml }}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AttachmentPatternsSection;
