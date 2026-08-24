"use client";

import { useEffect, useRef, useState, type FC } from "react";
import { TraitIcons, type ReportTheme } from "../reportTheme";
import { archetypeSlug, getReport2Config, type Report2CopySlug } from "@/data/report2-config";
import { heroMotivationSubtexts, heroTraitSubtexts } from "@/data/report2-hero-traits";

interface Props {
  matchScore: number;
  theme: ReportTheme;
}

const ANIMATION_DURATION_MS = 1800;

function splitMottoForWrap(motto: string) {
  const dashIndex = motto.indexOf("—");

  if (dashIndex === -1) {
    return [motto];
  }

  const leadSegment = `${motto.slice(0, dashIndex).trimEnd()}—`;
  const trailingSegment = motto.slice(dashIndex + 1).trimStart();

  return trailingSegment ? [leadSegment, trailingSegment] : [motto];
}

const CoreArchetypeSection: FC<Props> = ({ matchScore, theme }) => {
  const matchPct = Math.round(matchScore);
  const mottoSegments = splitMottoForWrap(theme.motto);
  // Report 2.0 config drives the ratified behavioural-tendency values + segment
  // fills; fall back to the existing theme where an archetype's config is a stub.
  const hero = getReport2Config(theme.archetype)?.hero ?? null;
  const slug = archetypeSlug(theme.archetype) as Report2CopySlug;
  const heroSubs = heroTraitSubtexts[slug];
  // "Core motivation: Healing" on its own was read as saying nothing at all
  // (2026-08-24 feedback). The noun stays; this is the sentence that earns it.
  const motivationSub = heroMotivationSubtexts[slug];
  const fillRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);
  const [displayPct, setDisplayPct] = useState(0);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    let frameId = 0;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      "matchMedia" in window &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      frameId = requestAnimationFrame(() => {
        setDisplayPct(matchPct);
        if (fillRef.current) fillRef.current.style.width = `${matchPct}%`;
      });
      return () => {
        if (frameId) cancelAnimationFrame(frameId);
      };
    }

    // Bar: single CSS transition — compositor-driven, no JS per frame
    if (fillRef.current) {
      fillRef.current.style.transition = `width ${ANIMATION_DURATION_MS}ms cubic-bezier(0.645, 0.045, 0.355, 1)`;
      // rAF ensures width:0% is painted before setting target, triggering the transition
      frameId = requestAnimationFrame(() => {
        if (fillRef.current) fillRef.current.style.width = `${matchPct}%`;
      });
    }

    // Text count-up: independent RAF loop, does not touch the bar
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - start) / ANIMATION_DURATION_MS, 1);
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      setDisplayPct(Math.round(eased * matchPct));
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [matchPct]);

  return (
    <div className="report-flow report-flow--gap-xl">
      <article className="report-hero-card">
        {/* Glow orbs */}
        <span className="report-hero-card__orb report-hero-card__orb--tr" aria-hidden="true" />
        <span className="report-hero-card__orb report-hero-card__orb--bl" aria-hidden="true" />

        {/* Header: badge + name + motto (left) + match strength (right) */}
        <div className="report-hero-card__header">
          <div className="report-hero-card__header-copy">
            <div className="report-hero-card__badge">Your Core Archetype</div>
            <h3 className="report-hero-card__title">{theme.archetype}</h3>
          </div>
          <p className="report-hero-card__motto">
            <span className="report-hero-card__motto-chunk report-hero-card__motto-chunk--lead">
              <span className="report-hero-card__motto-prefix">Motto: </span>
              <span className="report-hero-card__motto-segment">{mottoSegments[0]}</span>
            </span>
            {mottoSegments.slice(1).map((segment, index) => (
              <span key={`${theme.archetype}-motto-${index + 1}`}>
                <wbr />
                <span className="report-hero-card__motto-chunk">
                  <span className="report-hero-card__motto-segment">{segment}</span>
                </span>
              </span>
            ))}
          </p>
          <div className="report-hero-card__match">
            <div className="report-hero-card__match-header">
              <span className="report-hero-card__match-label">Match Strength</span>
              <span className="report-hero-card__match-value">{displayPct}%</span>
            </div>
            <div
              className="report-hero-card__match-bar"
              aria-label={`Match strength: ${matchPct}%`}
            >
              <div ref={fillRef} className="report-hero-card__match-fill" style={{ width: "0%" }} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="report-hero-card__content">
          <p className="report-hero-card__label">Behavioral tendencies:</p>

          <div className="report-hero-card__motivation">
            <div className="report-hero-card__motivation-icon" aria-hidden="true">
              {/* Three concentric elements: outer ring → middle ring → inner filled circle */}
              <svg viewBox="0 0 40 40" fill="none" className="size-full">
                <circle
                  cx="20"
                  cy="20"
                  r="19.5"
                  stroke="rgb(var(--report-accent-ink-rgb, var(--report-accent-rgb)))"
                  strokeWidth="0.8"
                />
                <circle
                  cx="20"
                  cy="20"
                  r="11.5"
                  stroke="rgb(var(--report-accent-ink-rgb, var(--report-accent-rgb)))"
                  strokeWidth="0.8"
                />
                <circle
                  cx="20"
                  cy="20"
                  r="5"
                  fill="rgb(var(--report-accent-ink-rgb, var(--report-accent-rgb)))"
                />
              </svg>
            </div>
            <div className="report-hero-card__motivation-copy">
              <p className="report-hero-card__motivation-label">Core motivation:</p>
              <p className="report-hero-card__motivation-value">{theme.motivation}</p>
              {motivationSub ? (
                <p className="report-hero-card__motivation-sub">{motivationSub}</p>
              ) : null}
            </div>
          </div>

          <div className="report-hero-card__traits">
            <TraitItem
              label="Communication — how desire gets spoken"
              value={hero?.traits?.communication ?? theme.communication}
              sub={heroSubs?.communication}
              icon={TraitIcons.communication}
            />
            <TraitItem
              label="Initiation — how sex gets started"
              value={hero?.traits?.initiation ?? theme.initiation}
              sub={heroSubs?.initiation}
              icon={TraitIcons.initiation}
            />
            <TraitItem
              label="Attachment — how closeness feels"
              value={hero?.traits?.attachment ?? theme.attachment}
              sub={heroSubs?.attachment}
              icon={TraitIcons.attachment}
              iconClassName="report-trait__icon report-trait__icon--attachment"
            />
            <TraitItem
              label="Power — who leads, who yields"
              value={hero?.traits?.power ?? theme.powerOrientation}
              sub={heroSubs?.power}
              icon={TraitIcons.powerOrientation}
            />
          </div>

          <div className="report-hero-card__progress">
            <ProgressRow
              label="Risk orientation"
              segments={hero?.risk_segments ?? theme.riskSegments}
              value={theme.riskOrientation}
            />
            <ProgressRow
              label="Typical confidence"
              segments={hero?.confidence_segments ?? theme.confidenceSegments}
              value={theme.confidence}
            />
          </div>
        </div>
      </article>
    </div>
  );
};

const TraitItem: FC<{
  icon: FC<{ className?: string }>;
  iconClassName?: string;
  label: string;
  value: string;
  sub?: string;
}> = ({ icon: Icon, iconClassName = "report-trait__icon", label, value, sub }) => (
  <div className="report-trait">
    <p className="report-trait__label">
      <Icon className={iconClassName} />
      <span>{label}</span>
    </p>
    <p className="report-trait__value">{value}</p>
    {sub ? <p className="report-trait__sub">yours: {sub}</p> : null}
  </div>
);

const ProgressRow: FC<{
  label: string;
  segments: 1 | 2 | 3;
  value: string;
}> = ({ label, segments, value }) => (
  <div className="report-progress">
    <div className="report-progress__header">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
    <div className="report-progress__segments" aria-hidden="true">
      {[0, 1, 2].map((segment) => (
        <span key={`${label}-${segment}`} className={segment < segments ? "is-filled" : ""} />
      ))}
    </div>
  </div>
);

export default CoreArchetypeSection;
