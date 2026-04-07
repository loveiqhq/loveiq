"use client";

import { useEffect, useRef, useState, type FC, type ReactNode } from "react";
import ArcGauge from "./ArcGauge";

interface SnapshotContent {
  importanceLabel: string;
  importanceValue: number | null;
  satisfactionLabel: string;
  satisfactionValue: number | null;
  stage: string | null;
}

interface Props {
  feedbackWidget: ReactNode;
  generalHtml: string;
  sectionId: string;
  snapshot: SnapshotContent;
}

const stageDescriptions: Record<string, string> = {
  "Recharging / Pausing":
    "Your system is asking for less pressure, more rest, and room to recover.",
  "Repairing / Reconnecting":
    "Tenderness, repair, and restoring trust matter more than intensity right now.",
  "Awakening / Exploring":
    "Curiosity is returning and your system wants low-stakes discovery rather than certainty.",
  "Expanding / Experimenting":
    "You feel more confident and want greater expression, communication, novelty, or play.",
  "Grounded / Integrated":
    "Pleasure works best when it feels steady, embodied, and sustainably connected to daily life.",
  "Evolving / Transcending":
    "Intimacy feels most alive when it carries meaning, devotion, and a sense of expansion.",
};

function describeScalarValue(label: string, value: number | null) {
  if (value === null)
    return "We do not have enough signal yet to place this part of your snapshot.";

  if (label === "Current Sexual Satisfaction") {
    if (value <= 2) {
      return "Sex currently feels distant, frustrating, or emotionally expensive more often than nourishing.";
    }
    if (value <= 5) {
      return "Some parts work, but frustration, inconsistency, or disappointment still pulls satisfaction down.";
    }
    return "Your sexual life currently feels like a meaningful source of pleasure, alignment, and connection.";
  }

  if (value <= 2) {
    return "Sex is not the main organizing force in life right now and may matter mostly in specific contexts.";
  }
  if (value <= 5) {
    return "Sex matters, but it shares space with other priorities and tends to depend on context and timing.";
  }
  return "Sex feels like a strong area of importance for your life, identity, and sense of connection.";
}

const WelcomeSection: FC<Props> = ({ feedbackWidget, generalHtml, sectionId, snapshot }) => {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
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

  const cleanHtml = generalHtml
    .replace(/<table>[\s\S]*?<\/table>/g, "")
    .replace(/<p>Your snapshot<\/p>/g, "")
    .trim();

  return (
    <section
      ref={ref}
      id={sectionId}
      data-report-section="true"
      className={`report-section report-section--welcome ${isVisible ? "is-visible" : ""}`}
    >
      <div className="report-section__header report-section__header--welcome">
        <div>
          <p className="report-overline">Your report</p>
          <h2 className="report-section__title">Welcome</h2>
        </div>
        <div className="report-section__header-actions">
          {feedbackWidget}
          <a href="/survey" className="report-button report-button--secondary">
            Invite a friend
          </a>
        </div>
      </div>

      <div
        className="report-prose report-prose--lead"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />

      <div className="report-welcome-grid">
        <MetricCard
          animate={isVisible}
          description={describeScalarValue(
            "Current Sexual Satisfaction",
            snapshot.satisfactionValue
          )}
          label="Current Sexual Satisfaction"
          value={snapshot.satisfactionValue}
        />
        <MetricCard
          animate={isVisible}
          description={describeScalarValue("Importance of Sex", snapshot.importanceValue)}
          label="Importance of Sex"
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
    </section>
  );
};

const MetricCard: FC<{
  animate: boolean;
  description: string;
  label: string;
  value: number | null;
}> = ({ animate, description, label, value }) => (
  <article className="report-card report-card--metric">
    <p className="report-card__eyebrow">{label}</p>
    <ArcGauge animate={animate} max={7} value={value ?? 0} />
    <div className="report-card__metric-value">
      <span>{value ?? "--"}</span>
      <small>/7</small>
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
      <p className="report-card__description">
        {description || "We need more report data to describe this stage cleanly."}
      </p>
    </div>
  </article>
);

export default WelcomeSection;
