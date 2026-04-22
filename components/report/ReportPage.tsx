"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FC,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { archetypeContent } from "@/data/report-archetypes";
import { reportSections } from "@/data/report-general";
import { cacheReportCheckoutQuote } from "@/lib/checkout/reportCheckoutQuoteCache";
import { buildReportCheckoutHref, type ReportPurchasePlanId } from "@/lib/checkout/reportPurchase";
import type { ReportPriceQuoteSnapshot } from "@/lib/pricing/reportPricing";
import FooterSection from "@/components/landing/FooterSection";
import ReportNavigation from "./ReportNavigation";
import ReportPricingModal from "./ReportPricingModal";
import ReportSection from "./ReportSection";
import SectionFeedback from "./SectionFeedback";
import ViewingBanner from "./ViewingBanner";
import { getReportSessionId } from "@/components/survey/hooks/surveySession";
import { useReportData, type ReportRequestError } from "./hooks/useReportData";
import { useSectionFeedback, type FeedbackPayload } from "./hooks/useSectionFeedback";
import { resolveReportSections } from "./reportTitles";
import { getReportTheme, getReportThemeStyle } from "./reportTheme";
import ArchetypeProbabilitySection from "./sections/ArchetypeProbabilitySection";
import AttachmentPatternsSection from "./sections/AttachmentPatternsSection";
import CoreArchetypeSection from "./sections/CoreArchetypeSection";
import DimensionSection from "./sections/DimensionSection";
import ImportanceOfSexualitySection from "./sections/ImportanceOfSexualitySection";
import PracticeTendenciesSection from "./sections/PracticeTendenciesSection";
import WelcomeSection from "./sections/WelcomeSection";
import { normalizeReportHtml } from "./reportContent";
import { isSectionUnlockedForPlan, type ReportAccessPlan } from "@/lib/report/access";
import { fromArchetypeSlug, isArchetypeName, toArchetypeSlug } from "@/lib/report/archetypeSlug";
import { getCsrfToken } from "@/lib/csrf-client";

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

interface SnapshotAnswers {
  currentSexualSatisfaction: number | null;
  importanceOfSex: number | null;
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

/** Maps 1-7 scale values to display percentages */
const SCALE_TO_PERCENT: Record<number, number> = {
  1: 14,
  2: 29,
  3: 43,
  4: 57,
  5: 71,
  6: 86,
  7: 97,
};

const SATISFACTION_STATUS_LABELS: Record<number, string> = {
  1: "Very dissatisfied",
  2: "Mostly dissatisfied",
  3: "Slightly dissatisfied",
  4: "Mixed / in-between",
  5: "Slightly satisfied",
  6: "Mostly satisfied",
  7: "Very satisfied",
};

const IMPORTANCE_STATUS_LABELS: Record<number, string> = {
  1: "Not important",
  2: "Mostly unimportant",
  3: "Slightly unimportant",
  4: "Mixed / in-between",
  5: "Slightly important",
  6: "Mostly important",
  7: "Very important",
};

function scaleToPercent(value: number | null): number | null {
  if (value === null) return null;
  return SCALE_TO_PERCENT[value] ?? null;
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

function describeSatisfactionStatus(value: number | null) {
  if (value === null) return "Still calibrating";
  return SATISFACTION_STATUS_LABELS[value] ?? "Still calibrating";
}

function describeImportanceStatus(value: number | null) {
  if (value === null) return "Still calibrating";
  return IMPORTANCE_STATUS_LABELS[value] ?? "Still calibrating";
}

function getSnapshotContent(
  diagnostics: Record<string, unknown> | null,
  snapshotAnswers: SnapshotAnswers | null
): SnapshotContent {
  const satisfactionValue = getScalarOverlay(diagnostics, "OVL_SATISFACTION");
  const importanceValue = getScalarOverlay(diagnostics, "OVL_TOPIC_IMPORTANCE");
  const stageCode = getEnumOverlay(diagnostics, "OVL_PHASE_NOW");

  const stage = stageCode ? (STAGE_CODE_TO_LABEL[stageCode] ?? toTitleCase(stageCode)) : null;

  return {
    satisfactionValue,
    satisfactionPct: scaleToPercent(satisfactionValue),
    satisfactionLabel:
      satisfactionValue === null
        ? ""
        : `${describeBand(satisfactionValue)} (${satisfactionValue}/7)`,
    satisfactionStatusLabel: describeSatisfactionStatus(
      snapshotAnswers?.currentSexualSatisfaction ?? null
    ),
    importanceValue,
    importancePct: scaleToPercent(importanceValue),
    importanceStatusLabel: describeImportanceStatus(snapshotAnswers?.importanceOfSex ?? null),
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
  return normalizeReportHtml(
    html
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
      .replace(/<table>[\s\S]*?<\/table>/g, "")
  );
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

interface ReportPageProps {
  token?: string;
}

interface ReportExperienceProps {
  accessPlan: ReportAccessPlan;
  devParam: string | null;
  feedbacks: Record<string, "up" | "down" | null>;
  isPricingModalOpen: boolean;
  matchScore: number;
  onBeginCheckout: (plan: ReportPurchasePlanId, archetype?: string | null) => void;
  onClosePricingModal: () => void;
  onUnlockArchetype: (archetypeName: string) => void;
  percentages: Record<string, number>;
  pricingTargetArchetype: string | null;
  placeholderValues: {
    archetype: string;
    matchScore: number;
    motto: string;
    reportDate: string;
    snapshot: SnapshotContent;
    userName: string;
  };
  primaryArchetype: string;
  pricingQuotes: Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot> | null;
  ranking: string[];
  reportDate: string;
  resolvedSections: ReturnType<typeof resolveReportSections>;
  returnToPrimaryHref: string;
  snapshot: SnapshotContent;
  submitFeedback: (sectionId: string, payload: FeedbackPayload) => void;
  submitted: Record<string, boolean>;
  theme: ReturnType<typeof getReportTheme>;
  unlockedArchetypes: Set<string>;
  userName: string | null;
  viewArchetype: string;
}

const ReportExperience: FC<ReportExperienceProps> = ({
  accessPlan,
  devParam,
  feedbacks,
  isPricingModalOpen,
  matchScore,
  onBeginCheckout,
  onClosePricingModal,
  onUnlockArchetype,
  percentages,
  placeholderValues,
  primaryArchetype,
  pricingQuotes,
  pricingTargetArchetype,
  ranking,
  reportDate,
  resolvedSections,
  returnToPrimaryHref,
  snapshot,
  submitFeedback,
  submitted,
  theme,
  unlockedArchetypes,
  userName,
  viewArchetype,
}) => {
  const mainContentRef = useRef<HTMLElement | null>(null);
  const [activeSectionId, setActiveSectionId] = useState(resolvedSections[0]?.id ?? "welcome");
  const [unlockedSections, setUnlockedSections] = useState<Record<string, boolean>>({});
  const clickLockUntilRef = useRef(0);

  const handleSectionClick = (sectionId: string) => {
    clickLockUntilRef.current = Date.now() + 800;
    setActiveSectionId(sectionId);
  };

  // TEMP (beta): any unlock CTA unlocks every section so testers don't
  // have to click each one. Revert once paywall gating is re-enabled —
  // original body set only the clicked sectionId to true.
  const unlockSection = (_sectionId: string) => {
    setUnlockedSections((current) => {
      const allAlreadyUnlocked = resolvedSections.every((s) => current[s.id]);
      if (allAlreadyUnlocked) return current;
      const next: Record<string, boolean> = { ...current };
      for (const s of resolvedSections) next[s.id] = true;
      return next;
    });
  };

  useEffect(() => {
    const ACTIVATION_LINE = 90;

    function buildSectionTops() {
      return resolvedSections
        .map((section) => {
          const el = document.getElementById(section.id);
          if (!el) return null;
          return { id: section.id, top: el.getBoundingClientRect().top + window.scrollY };
        })
        .filter((section): section is { id: string; top: number } => section !== null);
    }

    let sectionTops = buildSectionTops();
    let rafId: number | null = null;

    function updateActive() {
      if (Date.now() < clickLockUntilRef.current) return;
      const threshold = window.scrollY + ACTIVATION_LINE;
      let activeId = sectionTops[0]?.id ?? resolvedSections[0]?.id ?? "welcome";
      for (const section of sectionTops) {
        if (section.top <= threshold) {
          activeId = section.id;
        } else {
          break;
        }
      }
      setActiveSectionId(activeId);
    }

    function onScroll() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateActive();
      });
    }

    function onResize() {
      sectionTops = buildSectionTops();
      updateActive();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    updateActive();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [resolvedSections]);

  return (
    <main
      id="main-content"
      ref={mainContentRef}
      tabIndex={-1}
      className="report-page"
      style={getReportThemeStyle(theme)}
    >
      {devParam && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#f59e0b",
            color: "#000",
            textAlign: "center",
            padding: "4px 8px",
            fontSize: "12px",
            zIndex: 9999,
            fontFamily: "monospace",
          }}
        >
          DEV — report loaded via ?dev_session URL param ({devParam.slice(0, 8)}...)
        </div>
      )}
      {viewArchetype !== primaryArchetype && (
        <ViewingBanner archetypeName={viewArchetype} returnHref={returnToPrimaryHref} />
      )}
      <div
        className={[
          "report-page__shell-wrap",
          isPricingModalOpen ? "report-page__shell-wrap--obscured" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden={isPricingModalOpen}
        inert={isPricingModalOpen}
      >
        <div className="report-shell">
          <ReportNavigation
            activeSectionId={activeSectionId}
            onSectionClick={handleSectionClick}
            primaryArchetype={viewArchetype}
            reportDate={reportDate}
            sections={resolvedSections}
          />

          <div className="report-content">
            {resolvedSections.map((section) => {
              const title = section.displayTitle;
              const generalHtml = replacePlaceholders(section.generalContent, placeholderValues);
              const archetypeHtml = normalizeReportHtml(
                section.archetypeBlockId
                  ? (archetypeContent[section.archetypeBlockId]?.[viewArchetype] ?? null)
                  : null
              );

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
                    primaryArchetype={viewArchetype}
                    sectionId={section.id}
                    title={title}
                  >
                    <CoreArchetypeSection
                      archetypeHtml={archetypeHtml}
                      matchScore={matchScore}
                      theme={theme}
                    />
                  </ReportSection>
                );
              }

              if (section.sectionNumber === 4) {
                return (
                  <ReportSection
                    key={section.id}
                    feedbackWidget={feedbackWidget}
                    primaryArchetype={primaryArchetype}
                    sectionId={section.id}
                    title={title}
                  >
                    <ArchetypeProbabilitySection
                      generalHtml={generalHtml}
                      onUnlock={onUnlockArchetype}
                      percentages={percentages}
                      primaryArchetype={primaryArchetype}
                      ranking={ranking}
                      unlockedArchetypes={unlockedArchetypes}
                    />
                  </ReportSection>
                );
              }

              if (section.sectionNumber === 7) {
                return (
                  <ReportSection
                    key={section.id}
                    feedbackWidget={feedbackWidget}
                    primaryArchetype={viewArchetype}
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

              if (section.sectionNumber === 8) {
                const isBackendUnlocked = isSectionUnlockedForPlan({
                  accessPlan,
                  isPremium: section.isPremium,
                  sectionId: section.id,
                });

                return (
                  <ReportSection
                    key={section.id}
                    feedbackWidget={feedbackWidget}
                    primaryArchetype={viewArchetype}
                    sectionId={section.id}
                    title={title}
                  >
                    <AttachmentPatternsSection
                      archetype={viewArchetype}
                      archetypeHtml={archetypeHtml}
                      generalHtml={generalHtml}
                      isPremium={section.isPremium}
                      isUnlocked={isBackendUnlocked || (unlockedSections[section.id] ?? false)}
                      onUnlock={() => unlockSection(section.id)}
                      sectionTitle={title}
                    />
                  </ReportSection>
                );
              }

              if (section.sectionNumber === 27) {
                const isBackendUnlocked = isSectionUnlockedForPlan({
                  accessPlan,
                  isPremium: section.isPremium,
                  sectionId: section.id,
                });
                const practiceSectionTitle = `Typical Sexual Fantasy & Practice Tendencies of the ${viewArchetype}`;

                return (
                  <ReportSection
                    key={section.id}
                    feedbackWidget={feedbackWidget}
                    primaryArchetype={viewArchetype}
                    sectionId={section.id}
                    title={practiceSectionTitle}
                  >
                    <PracticeTendenciesSection
                      archetype={viewArchetype}
                      archetypeHtml={archetypeHtml}
                      generalHtml={generalHtml}
                      isPremium={section.isPremium}
                      isUnlocked={isBackendUnlocked || (unlockedSections[section.id] ?? false)}
                      onUnlock={() => unlockSection(section.id)}
                      sectionTitle={practiceSectionTitle}
                    />
                  </ReportSection>
                );
              }

              const isBackendUnlocked = isSectionUnlockedForPlan({
                accessPlan,
                isPremium: section.isPremium,
                sectionId: section.id,
              });
              const isStageValueLocked = false;

              return (
                <ReportSection
                  key={section.id}
                  feedbackWidget={feedbackWidget}
                  primaryArchetype={viewArchetype}
                  sectionId={section.id}
                  title={title}
                >
                  <DimensionSection
                    archetype={viewArchetype}
                    archetypeHtml={archetypeHtml}
                    generalHtml={generalHtml}
                    isPremium={section.isPremium}
                    isStageValueLocked={isStageValueLocked}
                    isUnlocked={isBackendUnlocked || (unlockedSections[section.id] ?? false)}
                    onUnlock={() => unlockSection(section.id)}
                    sectionId={section.id}
                    sectionTitle={title}
                  />
                </ReportSection>
              );
            })}

            <FooterSection />
          </div>
        </div>
      </div>
      <ReportPricingModal
        archetype={primaryArchetype}
        open={isPricingModalOpen}
        onClose={onClosePricingModal}
        onUnlock={onBeginCheckout}
        quotes={pricingQuotes}
        returnFocusRef={mainContentRef}
        targetArchetype={pricingTargetArchetype}
      />
    </main>
  );
};

const ReportPage: FC<ReportPageProps> = ({ token }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storedSessionId = useSyncExternalStore(subscribeNoop, getReportSessionId, () => null);
  // NODE_ENV is statically replaced at build time by Next.js/webpack — safe in client components
  /* eslint-disable no-restricted-syntax */
  const devParam =
    process.env.NODE_ENV === "development" ? (searchParams.get("dev_session") ?? null) : null;
  /* eslint-enable no-restricted-syntax */
  const sessionId = devParam ?? storedSessionId;

  const { data, status, error } = useReportData({ token, sessionId: token ? null : sessionId });
  const { feedbacks, submitted, submitFeedback } = useSectionFeedback(sessionId);
  const [locallyUnlocked, setLocallyUnlocked] = useState<string[]>([]);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [pricingTargetArchetype, setPricingTargetArchetype] = useState<string | null>(null);
  const autoOpenedPricingRef = useRef(false);

  const accessPlan = data?.accessPlan ?? null;
  useEffect(() => {
    if (autoOpenedPricingRef.current) return;
    if (!data) return;
    const paywallDisabled = process.env.NEXT_PUBLIC_DISABLE_PAYWALL === "1";
    if (paywallDisabled) return;
    if (accessPlan !== null) return;
    autoOpenedPricingRef.current = true;
    // One-shot auto-open when the unpaid report first loads; guarded by
    // autoOpenedPricingRef so it never cascades.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPricingModalOpen(true);
  }, [accessPlan, data]);

  const apiUnlocked = data?.unlockedArchetypes;
  const primaryArchetypeFromData = data?.primaryArchetype;
  const unlockedArchetypes = useMemo(() => {
    const set = new Set<string>();
    if (apiUnlocked) {
      for (const name of apiUnlocked) set.add(name);
    }
    for (const name of locallyUnlocked) set.add(name);
    if (primaryArchetypeFromData) set.add(primaryArchetypeFromData);
    return set;
  }, [apiUnlocked, locallyUnlocked, primaryArchetypeFromData]);

  const archetypeSlugParam = searchParams.get("archetype");
  const requestedArchetype = fromArchetypeSlug(archetypeSlugParam);
  const viewArchetype =
    requestedArchetype && unlockedArchetypes.has(requestedArchetype)
      ? requestedArchetype
      : (primaryArchetypeFromData ?? "");

  const returnToPrimaryHref = useMemo(() => {
    if (devParam) {
      const params = new URLSearchParams({ dev_session: devParam });
      return `${pathname}?${params.toString()}`;
    }
    return pathname;
  }, [devParam, pathname]);

  const handleUnlockArchetype = useCallback(
    (name: string) => {
      if (!isArchetypeName(name)) return;

      const navigateTo = (archetypeName: string) => {
        if (archetypeName === primaryArchetypeFromData) {
          router.push(returnToPrimaryHref);
          return;
        }
        const slug = toArchetypeSlug(archetypeName);
        if (!slug) return;
        const params = new URLSearchParams();
        params.set("archetype", slug);
        if (devParam) params.set("dev_session", devParam);
        router.push(`${pathname}?${params.toString()}`);
      };

      if (unlockedArchetypes.has(name)) {
        navigateTo(name);
        return;
      }

      const paywallDisabled = process.env.NEXT_PUBLIC_DISABLE_PAYWALL === "1";
      if (!paywallDisabled) {
        setPricingTargetArchetype(name === primaryArchetypeFromData ? null : name);
        setIsPricingModalOpen(true);
        return;
      }

      void (async () => {
        try {
          const csrfToken = getCsrfToken();
          const body: Record<string, string> = { archetype: name };
          if (token) body.token = token;
          else if (sessionId) body.sessionId = sessionId;
          const res = await fetch("/api/report/unlock-archetype", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": csrfToken,
            },
            body: JSON.stringify(body),
          });
          if (!res.ok) return;
          const json = (await res.json()) as { unlockedArchetypes?: string[] };
          const returned = Array.isArray(json.unlockedArchetypes) ? json.unlockedArchetypes : [];
          setLocallyUnlocked((prev) => Array.from(new Set([...prev, ...returned, name])));
          navigateTo(name);
        } catch {
          // swallow — user can retry
        }
      })();
    },
    [
      devParam,
      pathname,
      primaryArchetypeFromData,
      returnToPrimaryHref,
      router,
      sessionId,
      token,
      unlockedArchetypes,
    ]
  );

  const beginCheckout = (plan: ReportPurchasePlanId, archetype?: string | null) => {
    const quote = data?.pricingQuotes?.[plan];
    if (quote) {
      cacheReportCheckoutQuote({
        plan,
        quote,
        sessionId: token ? null : sessionId,
        token,
      });
    }
    const archetypeForCheckout = plan === "full_report" ? (archetype ?? null) : null;
    router.push(buildReportCheckoutHref({ archetype: archetypeForCheckout, plan, token }));
  };

  const closePricingModal = useCallback(() => {
    setIsPricingModalOpen(false);
    setPricingTargetArchetype(null);
  }, []);

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

  const { diagnostics, percentages, primaryArchetype, snapshotAnswers } = data;
  const effectiveViewArchetype = viewArchetype || primaryArchetype;
  const theme = getReportTheme(effectiveViewArchetype);
  const ranking = Object.entries(percentages)
    .sort(([, left], [, right]) => right - left)
    .map(([name]) => name);
  const matchScore = percentages[effectiveViewArchetype] ?? percentages[primaryArchetype] ?? 0;
  const reportDate = new Date(data.reportDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const snapshot = getSnapshotContent(diagnostics, snapshotAnswers ?? null);

  const placeholderValues = {
    archetype: effectiveViewArchetype,
    matchScore,
    motto: theme.motto,
    reportDate,
    snapshot,
    userName: data.userName ?? "Friend",
  };
  const resolvedSections = resolveReportSections(reportSections, effectiveViewArchetype);

  return (
    <ReportExperience
      key={`${token ?? "browser"}:${sessionId ?? "anon"}`}
      devParam={devParam}
      accessPlan={data.accessPlan}
      feedbacks={feedbacks}
      isPricingModalOpen={isPricingModalOpen}
      matchScore={matchScore}
      onBeginCheckout={beginCheckout}
      onClosePricingModal={closePricingModal}
      onUnlockArchetype={handleUnlockArchetype}
      percentages={percentages}
      placeholderValues={placeholderValues}
      primaryArchetype={primaryArchetype}
      pricingQuotes={data.pricingQuotes}
      pricingTargetArchetype={pricingTargetArchetype}
      ranking={ranking}
      reportDate={reportDate}
      resolvedSections={resolvedSections}
      returnToPrimaryHref={returnToPrimaryHref}
      snapshot={snapshot}
      submitFeedback={submitFeedback}
      submitted={submitted}
      theme={theme}
      unlockedArchetypes={unlockedArchetypes}
      userName={data.userName}
      viewArchetype={effectiveViewArchetype}
    />
  );
};

export default ReportPage;
