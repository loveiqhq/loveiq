"use client";

import { useEffect, useState, useSyncExternalStore, type FC } from "react";
import { archetypeContent } from "@/data/report-archetypes";
import { reportSections } from "@/data/report-general";
import ReportFooter from "./ReportFooter";
import ReportNavigation from "./ReportNavigation";
import ReportSection from "./ReportSection";
import SectionFeedback from "./SectionFeedback";
import { getReportSessionId } from "@/components/survey/hooks/surveySession";
import { useReportData, type ReportRequestError } from "./hooks/useReportData";
import { useSectionFeedback } from "./hooks/useSectionFeedback";
import { resolveReportSections } from "./reportTitles";
import { getReportTheme, getReportThemeStyle } from "./reportTheme";
import ArchetypeProbabilitySection from "./sections/ArchetypeProbabilitySection";
import CoreArchetypeSection from "./sections/CoreArchetypeSection";
import DimensionSection from "./sections/DimensionSection";
import ImportanceOfSexualitySection from "./sections/ImportanceOfSexualitySection";
import WelcomeSection from "./sections/WelcomeSection";

interface SnapshotContent {
  importanceLabel: string;
  importanceValue: number | null;
  satisfactionLabel: string;
  satisfactionValue: number | null;
  stage: string | null;
}

const subscribeNoop = () => () => {};

function getScalarOverlay(diagnostics: Record<string, unknown> | null, key: string) {
  const overlays = diagnostics?.overlaysScalar;
  if (!overlays || typeof overlays !== "object") return null;
  const value = (overlays as Record<string, unknown>)[key];
  if (typeof value !== "number") return null;
  // Scoring engine stores 0-1 (scale_1_7_to_0_1). Convert back to 1-7.
  return Math.round(value * 6 + 1);
}

function getEnumOverlay(diagnostics: Record<string, unknown> | null, key: string) {
  const overlays = diagnostics?.overlaysEnum;
  if (!overlays || typeof overlays !== "object") return null;
  const entry = (overlays as Record<string, unknown>)[key];
  // Plain string (legacy) or {answer_code: string, one_hot: {...}}
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "answer_code" in entry) {
    const code = (entry as Record<string, unknown>).answer_code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split("/")
    .map((segment) =>
      segment
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    )
    .join(" / ");
}

function describeBand(value: number | null) {
  if (value === null) return "";
  if (value <= 2) return "Low";
  if (value <= 5) return "Moderate";
  return "High";
}

/** Maps scoring engine answer codes to display labels */
const STAGE_CODE_TO_LABEL: Record<string, string> = {
  recharging: "Recharging / Pausing",
  repairing: "Repairing / Reconnecting",
  awakening: "Awakening / Exploring",
  expanding: "Expanding / Experimenting",
  grounded: "Grounded / Integrated",
  evolving: "Evolving / Transcending",
};

function getSnapshotContent(diagnostics: Record<string, unknown> | null): SnapshotContent {
  const satisfactionValue = getScalarOverlay(diagnostics, "OVL_SATISFACTION");
  const importanceValue = getScalarOverlay(diagnostics, "OVL_TOPIC_IMPORTANCE");
  const stageCode = getEnumOverlay(diagnostics, "OVL_PHASE_NOW");

  const stage = stageCode ? (STAGE_CODE_TO_LABEL[stageCode] ?? toTitleCase(stageCode)) : null;

  return {
    satisfactionValue,
    satisfactionLabel:
      satisfactionValue === null
        ? ""
        : `${describeBand(satisfactionValue)} (${satisfactionValue}/7)`,
    importanceValue,
    importanceLabel:
      importanceValue === null ? "" : `${describeBand(importanceValue)} (${importanceValue}/7)`,
    stage,
  };
}

function replacePlaceholders(
  html: string,
  values: {
    archetype: string;
    matchScore: number;
    motto: string;
    reportDate: string;
    snapshot: SnapshotContent;
    userName: string;
  }
) {
  return html
    .replace(/\{\{USER_NAME\}\}/g, values.userName)
    .replace(
      /\{\{CORE_ARCHETYPE\}\}/g,
      `<span class="report-archetype-name">${values.archetype}</span>`
    )
    .replace(/\{\{CORE_ARCHETYPE_SCORE\}\}/g, String(Math.round(values.matchScore)))
    .replace(/\{\{CORE_ARCHETYPE_MOTTO\}\}/g, values.motto)
    .replace(/\{\{REPORT_DATE\}\}/g, values.reportDate)
    .replace(/\{\{SEXUAL_STAGE\}\}/g, values.snapshot.stage ?? "")
    .replace(/\{\{IMPORTANCE_OF_SEX\}\}/g, values.snapshot.importanceLabel)
    .replace(/\{\{SEXUAL_SATISFACTION\}\}/g, values.snapshot.satisfactionLabel)
    .replace(/<table>[\s\S]*?<\/table>/g, "");
}

interface ReportStatusState {
  title: string;
  copy: string;
  actionHref: string;
  actionLabel: string;
}

function getErrorState(error: ReportRequestError | null): ReportStatusState {
  switch (error?.statusCode) {
    case 403:
      return {
        title: "Unable to load report",
        copy: "Your secure report session expired or the request was rejected. Reload the report and try again.",
        actionHref: "/report",
        actionLabel: "Reload report",
      };
    case 404:
      return {
        title: "Report not found",
        copy: "We could not find a saved report for this survey session. Complete the survey again to generate a fresh report.",
        actionHref: "/survey",
        actionLabel: "Take the survey",
      };
    case 429:
      return {
        title: "Too many attempts",
        copy: "You have opened the report too many times in a short window. Wait a minute, then reload the report.",
        actionHref: "/report",
        actionLabel: "Reload report",
      };
    default:
      return {
        title: "Report temporarily unavailable",
        copy: "The report service failed while loading your results. Reload the report and try again in a moment.",
        actionHref: "/report",
        actionLabel: "Reload report",
      };
  }
}

const ReportPage: FC = () => {
  const sessionId = useSyncExternalStore(subscribeNoop, getReportSessionId, () => null);
  const [activeSectionId, setActiveSectionId] = useState(reportSections[0]?.id ?? "welcome");

  const { data, status, error } = useReportData(sessionId);
  const { feedbacks, submitted, submitFeedback } = useSectionFeedback(sessionId);

  useEffect(() => {
    if (status !== "success") return;

    const observedSections = reportSections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element instanceof HTMLElement);

    if (observedSections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        if (visible.length > 0) {
          setActiveSectionId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-18% 0px -58% 0px",
        threshold: [0.15, 0.3, 0.55],
      }
    );

    observedSections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [status]);

  if (status === "loading") {
    return (
      <main className="report-status-screen">
        <div className="report-status-card report-card">
          <div className="report-status-card__spinner" />
          <p className="report-status-card__label">Loading your report...</p>
        </div>
      </main>
    );
  }

  if (status === "missing") {
    return (
      <main className="report-status-screen">
        <div className="report-status-card report-card">
          <p className="report-overline">LoveIQ report</p>
          <h1 className="report-status-card__title">No saved report session</h1>
          <p className="report-status-card__copy">
            We could not find a saved report session in this browser. Complete the survey again to
            generate a fresh report.
          </p>
          <a href="/survey" className="report-button mt-3 inline-flex">
            Take the survey
          </a>
        </div>
      </main>
    );
  }

  if (status === "error" || !data) {
    const statusState = getErrorState(error);

    return (
      <main className="report-status-screen">
        <div className="report-status-card report-card">
          <p className="report-overline">LoveIQ report</p>
          <h1 className="report-status-card__title">{statusState.title}</h1>
          <p className="report-status-card__copy">{statusState.copy}</p>
          <a href={statusState.actionHref} className="report-button mt-3 inline-flex">
            {statusState.actionLabel}
          </a>
        </div>
      </main>
    );
  }

  const { diagnostics, percentages, primaryArchetype } = data;
  const theme = getReportTheme(primaryArchetype);
  const ranking = Object.entries(percentages)
    .sort(([, left], [, right]) => right - left)
    .map(([name]) => name);
  const matchScore = percentages[primaryArchetype] ?? 0;
  const reportDate = new Date(data.reportDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const snapshot = getSnapshotContent(diagnostics);

  const placeholderValues = {
    archetype: primaryArchetype,
    matchScore,
    motto: theme.motto,
    reportDate,
    snapshot,
    userName: data.userName ?? "Friend",
  };
  const resolvedSections = resolveReportSections(reportSections, primaryArchetype);

  return (
    <main id="main-content" className="report-page" style={getReportThemeStyle(theme)}>
      <div className="report-shell">
        <ReportNavigation
          activeSectionId={activeSectionId}
          onSectionClick={setActiveSectionId}
          primaryArchetype={primaryArchetype}
          reportDate={reportDate}
          sections={resolvedSections}
        />

        <div className="report-content">
          {resolvedSections.map((section) => {
            const title = section.displayTitle;
            const generalHtml = replacePlaceholders(section.generalContent, placeholderValues);
            const archetypeHtml = section.archetypeBlockId
              ? (archetypeContent[section.archetypeBlockId]?.[primaryArchetype] ?? null)
              : null;

            const feedbackWidget = section.hasResonatesFeedback ? (
              <SectionFeedback
                sectionTitle={title}
                value={feedbacks[section.id] ?? null}
                isSent={submitted[section.id] ?? false}
                onFeedback={(payload) => submitFeedback(section.id, payload)}
              />
            ) : null;

            if (section.sectionNumber === 1) {
              return (
                <WelcomeSection
                  key={section.id}
                  feedbackWidget={feedbackWidget}
                  generalHtml={generalHtml}
                  sectionId={section.id}
                  snapshot={snapshot}
                />
              );
            }

            if (section.sectionNumber === 3) {
              return (
                <ReportSection
                  key={section.id}
                  feedbackWidget={feedbackWidget}
                  sectionId={section.id}
                  title={title}
                >
                  <CoreArchetypeSection archetypeHtml={archetypeHtml} theme={theme} />
                </ReportSection>
              );
            }

            if (section.sectionNumber === 4) {
              return (
                <ReportSection
                  key={section.id}
                  feedbackWidget={feedbackWidget}
                  sectionId={section.id}
                  title={title}
                >
                  <ArchetypeProbabilitySection
                    generalHtml={generalHtml}
                    percentages={percentages}
                    primaryArchetype={primaryArchetype}
                    ranking={ranking}
                  />
                </ReportSection>
              );
            }

            if (section.sectionNumber === 7) {
              return (
                <ReportSection
                  key={section.id}
                  feedbackWidget={feedbackWidget}
                  sectionId={section.id}
                  title={title}
                >
                  <ImportanceOfSexualitySection
                    generalHtml={generalHtml}
                    importanceLabel={snapshot.importanceLabel}
                    importanceValue={snapshot.importanceValue}
                  />
                </ReportSection>
              );
            }

            return (
              <ReportSection
                key={section.id}
                feedbackWidget={feedbackWidget}
                sectionId={section.id}
                title={title}
              >
                <DimensionSection
                  archetype={primaryArchetype}
                  archetypeHtml={archetypeHtml}
                  generalHtml={generalHtml}
                  isPremium={section.isPremium}
                  sectionTitle={title}
                />
              </ReportSection>
            );
          })}

          <ReportFooter reportDate={reportDate} theme={theme} />
        </div>
      </div>
    </main>
  );
};

export default ReportPage;
