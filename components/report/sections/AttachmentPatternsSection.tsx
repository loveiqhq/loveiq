"use client";

import { useEffect, useRef, useState, type CSSProperties, type FC } from "react";
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

const ARCHETYPE_CHIP_COLORS: Record<string, { bg: string; border: string }> = {
  "Sensual Connector": { bg: "rgba(229,115,115,0.2)", border: "#e57373" },
  "Relational Nurturer": { bg: "rgba(127,174,158,0.2)", border: "#7fae9e" },
  "Loyal Ritualist": { bg: "rgba(42,255,143,0.2)", border: "#2aff8f" },
  "Spiritual Lover": { bg: "rgba(139,123,190,0.2)", border: "#8b7bbe" },
  "Curious Apprentice": { bg: "rgba(111,174,217,0.2)", border: "#6faed9" },
  "Approval Seeker": { bg: "rgba(231,179,194,0.2)", border: "#e7b3c2" },
  "Spark Seeker": { bg: "rgba(255,106,61,0.2)", border: "#ff6a3d" },
  "Minimalist Companion": { bg: "rgba(181,178,173,0.2)", border: "#b5b2ad" },
  "Emotional Voyeur": { bg: "rgba(46,246,227,0.2)", border: "#2ef6e3" },
  "Analytical Sexualist": { bg: "rgba(106,0,255,0.2)", border: "#6a00ff" },
  "Quiet Withdrawer": { bg: "rgba(201,247,245,0.2)", border: "#c9f7f5" },
  "Explorer of Edges": { bg: "rgba(255,46,99,0.2)", border: "#ff2e63" },
  "Power Orchestrator": { bg: "rgba(255,159,28,0.2)", border: "#ff9f1c" },
  "Exhibitionist Performer": { bg: "rgba(230,182,92,0.2)", border: "#e6b65c" },
};

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
  const gridRef = useRef<HTMLDivElement>(null);
  const [isRevealed, setIsRevealed] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = gridRef.current;
    if (!el || isRevealed) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isRevealed]);

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
            <div
              ref={gridRef}
              className={`report-attachment-patterns__grid${isRevealed ? " is-revealed" : ""}`}
            >
              {patterns.map((pattern, i) => (
                <article
                  key={pattern.title}
                  className="report-attachment-patterns__card"
                  data-tone={getAttachmentTone(pattern)}
                  style={{ ["--stagger-i" as string]: i } as CSSProperties}
                >
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
                    <div className="report-attachment-patterns__examples">
                      <span className="report-attachment-patterns__examples-label">
                        Associated Archetypes
                      </span>
                      <div className="report-attachment-patterns__chips">
                        {pattern.examples.map((example) => {
                          const chipColors = ARCHETYPE_CHIP_COLORS[example];
                          return (
                            <span
                              key={example}
                              className="report-attachment-patterns__chip"
                              style={
                                chipColors
                                  ? {
                                      background: chipColors.bg,
                                      borderColor: chipColors.border,
                                    }
                                  : undefined
                              }
                            >
                              {example}
                            </span>
                          );
                        })}
                      </div>
                    </div>
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
