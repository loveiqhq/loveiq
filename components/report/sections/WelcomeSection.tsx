"use client";

import { useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { InviteFriendIcon } from "../ReportActionIcons";
import ArcGauge from "./ArcGauge";

interface SnapshotContent {
  importanceLabel: string;
  importancePct: number | null;
  importanceStatusLabel: string;
  importanceValue: number | null;
  satisfactionLabel: string;
  satisfactionPct: number | null;
  satisfactionStatusLabel: string;
  satisfactionValue: number | null;
  stage: string | null;
}

interface Props {
  feedbackWidget: ReactNode;
  generalHtml: string;
  sectionId: string;
  snapshot: SnapshotContent;
}

const COUNT_UP_DURATION_MS = 1800;
const INITIAL_METRIC_REVEAL_DELAY_MS = 840;
const METRIC_REVEAL_DELAY_MS = 120;
const METRIC_REVEAL_THRESHOLD = 0.65;
const METRIC_REVEAL_ROOT_MARGIN = "0px 0px -12% 0px";

const stageDescriptions: Record<string, string> = {
  "Recharging / Pausing":
    "Sexuality feels quieter right now, and rest, lower pressure, or recovery matter most.",
  "Repairing / Reconnecting":
    "You are rebuilding trust, safety, openness, or connection after stress, pain, shame, or disconnection.",
  "Awakening / Exploring":
    "Desire feels curious and alive, and you are discovering what fits with lower-pressure exploration.",
  "Expanding / Experimenting":
    "You feel more confident and want greater expression, communication, novelty, or play.",
  "Grounded / Integrated":
    "Sexuality feels steadier and more established, with fulfillment coming through consistency, rhythm, and presence.",
  "Evolving / Transcending":
    "Sexuality feels expansive, meaningful, and connected to deeper emotional, creative, or spiritual dimensions.",
};

/** Per-value descriptions from survey question 01002 (scale 1-7) */
const satisfactionDescriptions: Record<number, string> = {
  1: "Your current sexual life feels clearly unfulfilling, frustrating, painful, absent, or far from what you want.",
  2: "More of your current experience feels lacking than fulfilling, and dissatisfaction is a noticeable part of your reality.",
  3: "Some parts may work, but there is enough frustration, inconsistency, or disappointment to pull your overall satisfaction down.",
  4: "Some parts feel okay or satisfying, while others feel lacking, unclear, inconsistent, or only partly fulfilling.",
  5: "Your sexual life feels more satisfying than not, even if some frustrations, gaps, or unmet needs remain.",
  6: "Most of your sexual life feels good, aligned, and meaningfully fulfilling, with only limited dissatisfaction.",
  7: "Your current sexual life feels deeply fulfilling, aligned, and broadly good for you overall.",
};

/** Per-value descriptions from survey question 16013 (scale 1-7) */
const importanceDescriptions: Record<number, string> = {
  1: "Understanding your sexuality does not feel central to your life right now.",
  2: "This matters a little, but it is not a major life priority for you.",
  3: "It has some relevance, but is not among your primary concerns right now.",
  4: "It matters, but it is one meaningful area among several in your life.",
  5: "Understanding your sexuality feels meaningfully relevant to your wellbeing, relationships, or growth.",
  6: "This feels like a strong area of importance for your life and self-understanding.",
  7: "Understanding your sexuality feels deeply important to your life, wellbeing, or growth.",
};

function describeScalarValue(label: string, value: number | null) {
  if (value === null)
    return "We do not have enough signal yet to place this part of your snapshot.";

  const descriptions =
    label === "Current Sexual Satisfaction" ? satisfactionDescriptions : importanceDescriptions;
  return descriptions[value] ?? descriptions[4]!;
}

const WelcomeSection: FC<Props> = ({ feedbackWidget, generalHtml, sectionId, snapshot }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [animateReady, setAnimateReady] = useState(false);

  // Fade-in for the whole section
  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || animateReady) return;
    const grid = gridRef.current;
    if (!grid) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      "matchMedia" in window &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let timeoutId = 0;

    const reveal = (delay: number) => {
      timeoutId = window.setTimeout(
        () => {
          setAnimateReady(true);
        },
        prefersReducedMotion ? 0 : delay
      );
    };

    // On mobile, cards stack vertically making the grid taller than the viewport.
    // IntersectionObserver caps intersectionRatio at viewportHeight/elementHeight,
    // so a fixed 0.65 threshold is unreachable. Compute the highest achievable
    // ratio and use 90% of it so the animation triggers when meaningfully in view.
    const gridRect = grid.getBoundingClientRect();
    const maxAchievableRatio =
      gridRect.height > 0 ? Math.min(1, window.innerHeight / gridRect.height) : 1;
    const effectiveThreshold = Math.min(METRIC_REVEAL_THRESHOLD, maxAchievableRatio * 0.9);

    const isAboveTheFoldOnLoad =
      typeof window !== "undefined" &&
      window.scrollY <= 16 &&
      isElementVisibleEnough(grid, effectiveThreshold);

    if (isAboveTheFoldOnLoad) {
      reveal(INITIAL_METRIC_REVEAL_DELAY_MS);
      return () => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || entry.intersectionRatio < effectiveThreshold) return;
        reveal(METRIC_REVEAL_DELAY_MS);
        observer.disconnect();
      },
      {
        threshold: [0, effectiveThreshold, 1],
        rootMargin: METRIC_REVEAL_ROOT_MARGIN,
      }
    );

    observer.observe(grid);
    return () => {
      observer.disconnect();
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [animateReady, isVisible]);

  const cleanHtml = generalHtml
    .replace(/<table>[\s\S]*?<\/table>/g, "")
    .replace(/<p>Your snapshot<\/p>/g, "")
    .trim();

  return (
    <section
      ref={sectionRef}
      id={sectionId}
      data-report-section="true"
      className={`report-section report-section--welcome ${isVisible ? "is-visible" : ""}`}
    >
      <div className="report-section__actions-row">
        <a href="/survey" className="report-button">
          <InviteFriendIcon />
          <span>Invite a Friend</span>
        </a>
      </div>

      <div className="report-section__header report-section__header--welcome">
        <h2 className="report-section__title">Welcome</h2>
      </div>

      <div
        className="report-prose report-prose--lead"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />

      <div ref={gridRef} className="report-welcome-grid">
        <MetricCard
          animate={animateReady}
          description={describeScalarValue(
            "Current Sexual Satisfaction",
            snapshot.satisfactionValue
          )}
          label="Current Sexual Satisfaction"
          pct={snapshot.satisfactionPct}
          status={snapshot.satisfactionStatusLabel}
          value={snapshot.satisfactionValue}
        />
        <MetricCard
          animate={animateReady}
          description={describeScalarValue("Importance of Sex", snapshot.importanceValue)}
          label="Importance of Sex"
          pct={snapshot.importancePct}
          status={snapshot.importanceStatusLabel}
          value={snapshot.importanceValue}
        />
        <StageCard
          stage={snapshot.stage}
          description={
            snapshot.stage
              ? (stageDescriptions[snapshot.stage] ?? stageDescriptions["Grounded / Integrated"])
              : ""
          }
        />
      </div>

      {feedbackWidget ? <div className="report-section__feedback-row">{feedbackWidget}</div> : null}
    </section>
  );
};

/** Animates a number counting up from 0 to target */
const CountUp: FC<{ value: number; animate: boolean }> = ({ value, animate }) => {
  const [display, setDisplay] = useState(0);
  const hasRun = useRef(false);

  useEffect(() => {
    if (!animate || hasRun.current) return;
    hasRun.current = true;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      "matchMedia" in window &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      const reducedMotionFrame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(reducedMotionFrame);
    }

    const start = performance.now();
    let frameId = 0;

    const step = (now: number) => {
      const progress = Math.min((now - start) / COUNT_UP_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [animate, value]);

  return <>{display}</>;
};

const MetricCard: FC<{
  animate: boolean;
  description: string;
  label: string;
  pct: number | null;
  status?: string;
  value: number | null;
}> = ({ animate, description, label, pct, status, value }) => (
  <article
    className={`report-card report-card--metric${status ? " report-card--metric-has-status" : ""}`}
  >
    <p className="report-card__eyebrow">{label}</p>
    {status ? <p className="report-card__status">{status}</p> : null}
    <div className="report-gauge-wrap">
      <ArcGauge animate={animate} max={7} tone="shared" value={value ?? 0} />
      <div className="report-card__metric-value">
        <span>
          {pct !== null ? (
            <>
              <CountUp value={pct} animate={animate} />%
            </>
          ) : (
            "--"
          )}
        </span>
      </div>
    </div>
    <p className="report-card__description">{description}</p>
  </article>
);

const StageCard: FC<{
  description: string;
  stage: string | null;
}> = ({ description, stage }) => (
  <article className="report-card report-card--metric">
    <p className="report-card__eyebrow">Likely Current Sexual Stage</p>
    <div className="report-stage-card__body">
      <p className="report-stage-card__title">{stage ?? "Still calibrating"}</p>
    </div>
    <p className="report-card__description">
      {description || "We need more report data to describe this stage cleanly."}
    </p>
  </article>
);

export default WelcomeSection;

function isElementVisibleEnough(element: Element, threshold: number) {
  const rect = element.getBoundingClientRect();
  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight || document.documentElement.clientHeight : 0;

  if (rect.height <= 0 || viewportHeight <= 0) return false;

  const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
  return visibleHeight / rect.height >= threshold;
}
