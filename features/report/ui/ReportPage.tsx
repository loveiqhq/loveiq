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
import { reportSections } from "@/data/report-general";
import { escapeHtml } from "@shared/format/html-escape";
import { cacheReportCheckoutQuote } from "@features/checkout/server/reportCheckoutQuoteCache";
import {
  buildReportCheckoutHref,
  type ReportPurchasePlanId,
} from "@features/checkout/server/reportPurchase";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { canSharePlan } from "@features/report/server/planAccess";
import InviteModal from "@features/invite/ui/InviteModal";
import FooterSection from "@features/landing/ui/FooterSection";
import ReportDesktopSidebar from "./ReportDesktopSidebar";
import ReportMobileNav from "./ReportMobileNav";
import { PaywallCountdownProvider } from "./PaywallCountdown";
import ReportPricingModal from "./ReportPricingModal";
import ReportStickyUnlockBar from "./ReportStickyUnlockBar";
import ScrollPricingModal from "./ScrollPricingModal";
import ReportSection from "./ReportSection";
import SectionFeedback from "./SectionFeedback";
import ShareReportModal from "./ShareReportModal";
import ShareVerifyGate from "./ShareVerifyGate";
import SharedViewerBanner from "./SharedViewerBanner";
import {
  getReportPaywallDeadline,
  getReportSessionId,
  setReportNurturePromo,
  setReportPricingSessionId,
} from "@features/survey/ui/hooks/surveySession";
import { useReportData, type ReportRequestError } from "./hooks/useReportData";
import { useSectionFeedback, type FeedbackPayload } from "./hooks/useSectionFeedback";
import { resolveReportSections, type DisplayReportSection } from "./reportTitles";
import { getReportTheme, getReportThemeStyle } from "./reportTheme";
import ArchetypeProbabilitySection from "./sections/ArchetypeProbabilitySection";
import AttachmentPatternsSection from "./sections/AttachmentPatternsSection";
import CoreArchetypeSection from "./sections/CoreArchetypeSection";
import DimensionSection from "./sections/DimensionSection";
import ImportanceOfSexualitySection from "./sections/ImportanceOfSexualitySection";
import PracticeTendenciesSection from "./sections/PracticeTendenciesSection";
import SexualStageSection from "./sections/SexualStageSection";
import WelcomeSection from "./sections/WelcomeSection";
import { summaryArchetypeContent } from "@/data/report-summary";
import { normalizeReportHtml } from "./reportContent";
import {
  isSectionIncludedInEssentials,
  isSectionUnlockedForPlan,
  type ReportAccessPlan,
} from "@features/report/server/access";
import {
  fromArchetypeSlug,
  isArchetypeName,
  toArchetypeSlug,
} from "@features/report/server/archetypeSlug";
import {
  setForcedPaywallArm,
  setReportSubmissionContext,
  trackExperimentExposure,
  trackLockedCardPriceShown,
  trackLockIconClicked,
  trackPaywallCountdownExpired,
  trackPaywallInitiated,
  trackReferFriendOpened,
  trackReportChapterMenuOpened,
  trackReportShareOpened,
  trackReportViewed,
} from "@features/analytics/client";
import {
  FORCED_PAYWALL_EXPERIMENT,
  resolveDevCohortOverride,
  resolveReportPaywallCohort,
} from "@shared/experiments/forcedPaywall";
import { shouldAutoOpenOfferModal } from "../logic/paywallModal";
import { useReportEngagementTimers } from "./hooks/useReportEngagementTimers";

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
  // Every substitution lands in a dangerouslySetInnerHTML; escape every
  // value (user-controlled or server-derived) so a malicious first name or
  // a future server-side change can't inject HTML/script. The labels below
  // are plain text by contract — escaping them is a safe no-op.
  return normalizeReportHtml(
    html
      .replace(/\{\{USER_NAME\}\}/g, escapeHtml(values.userName))
      .replace(
        /\{\{CORE_ARCHETYPE\}\}/g,
        `<span class="report-archetype-name">${escapeHtml(values.archetype)}</span>`
      )
      .replace(/\{\{CORE_ARCHETYPE_SCORE\}\}/g, String(Math.round(values.matchScore)))
      .replace(/\{\{CORE_ARCHETYPE_MOTTO\}\}/g, escapeHtml(values.motto))
      .replace(/\{\{REPORT_DATE\}\}/g, escapeHtml(values.reportDate))
      .replace(/\{\{SEXUAL_STAGE\}\}/g, escapeHtml(values.snapshot.stage ?? ""))
      .replace(/\{\{IMPORTANCE_OF_SEX\}\}/g, escapeHtml(values.snapshot.importanceLabel))
      .replace(/\{\{SEXUAL_SATISFACTION\}\}/g, escapeHtml(values.snapshot.satisfactionLabel))
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
  archetypeTiers: Record<string, "essentials" | "full_report">;
  devParam: string | null;
  diagnostics: Record<string, unknown> | null;
  submissionSeed: string | number | null;
  feedbacks: Record<string, "up" | "down" | null>;
  isPricingModalOpen: boolean;
  isScrollTeaserOpen: boolean;
  isShareModalOpen: boolean;
  matchScore: number;
  offerDeadline?: number;
  onBeginCheckout: (plan: ReportPurchasePlanId, archetype?: string | null) => void;
  onClosePricingModal: () => void;
  onCloseShareModal: () => void;
  onOpenShareModal: () => void;
  onOpenPricingModal: (archetype?: string | null) => void;
  onUnlockArchetype: (archetypeName: string) => void;
  onPurchaseFullReport: () => void;
  ownerFirstName: string | null;
  ownerToken: string | null;
  percentages: Record<string, number>;
  pricingTargetArchetype: string | null;
  pricingVariant: "default" | "offer" | "share";
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
  archetypeContent: Record<string, Record<string, string>>;
  practiceTendencies: Record<
    string,
    import("./hooks/useReportData").ReportPracticeTendencyContentForUser
  >;
  ranking: string[];
  reportDate: string;
  resolvedSections: ReturnType<typeof resolveReportSections>;
  snapshot: SnapshotContent;
  submitFeedback: (sectionId: string, payload: FeedbackPayload) => void;
  submitted: Record<string, boolean>;
  theme: ReturnType<typeof getReportTheme>;
  unlockedArchetypes: Set<string>;
  userEmail: string | null;
  userName: string | null;
  viewArchetype: string;
  viewMode: "owner" | "shared";
}

const ReportExperience: FC<ReportExperienceProps> = ({
  accessPlan,
  archetypeTiers,
  devParam,
  diagnostics,
  submissionSeed,
  feedbacks,
  isPricingModalOpen,
  isScrollTeaserOpen,
  isShareModalOpen,
  matchScore,
  offerDeadline,
  onBeginCheckout,
  onClosePricingModal,
  onCloseShareModal,
  onOpenShareModal,
  onOpenPricingModal,
  onUnlockArchetype,
  onPurchaseFullReport,
  ownerFirstName,
  ownerToken,
  percentages,
  placeholderValues,
  primaryArchetype,
  pricingQuotes,
  archetypeContent,
  practiceTendencies,
  pricingTargetArchetype,
  pricingVariant,
  ranking,
  resolvedSections,
  snapshot,
  submitFeedback,
  submitted,
  theme,
  unlockedArchetypes,
  userEmail,
  userName,
  viewArchetype,
  viewMode,
}) => {
  const mainContentRef = useRef<HTMLElement | null>(null);
  const [activeSectionId, setActiveSectionId] = useState(resolvedSections[0]?.id ?? "welcome");
  // Live full-report quote used by the locked premium cards' price/strike/save.
  // Same source the pricing modal and sticky bar read, so all three agree.
  const fullReportQuote = pricingQuotes?.full_report ?? null;
  // The report shows locked premium cards (inline price + countdown) when it
  // isn't fully unlocked and has at least one premium section. Gates both the
  // shared countdown ticker and the price-exposure analytics event.
  const hasLockedPremiumCards =
    accessPlan !== "full_report" &&
    accessPlan !== "all_reports" &&
    resolvedSections.some((section) => section.isPremium);

  // Fire one "locked chapter card price shown" event per report when the inline
  // PremiumOverlay surface (live price + countdown) is actually on the page —
  // i.e. the report isn't fully unlocked, there's a premium section, and a
  // quote to price it. Deduped to a single row/report; arm auto-stamped.
  const lockedCardPriceFiredRef = useRef(false);
  useEffect(() => {
    if (lockedCardPriceFiredRef.current) return;
    if (!hasLockedPremiumCards) return;
    if (!fullReportQuote) return;
    lockedCardPriceFiredRef.current = true;
    trackLockedCardPriceShown({
      plan: "full_report",
      price: fullReportQuote.currentPriceCents / 100,
      currency: fullReportQuote.currency,
      bucket: fullReportQuote.basePriceBucket,
      pricing_cluster_id: fullReportQuote.pricingClusterId,
      discount_step: fullReportQuote.discountStep,
      experiment_group: fullReportQuote.experimentGroup,
      msrp: fullReportQuote.msrpCents / 100,
      initial_price: fullReportQuote.initialPriceCents / 100,
    });
  }, [hasLockedPremiumCards, fullReportQuote]);
  // Auto-open the Refer-a-Friend modal when the page is loaded with ?invite=1.
  // Reminder emails (`invite-reminder-1`/`-2`) deep-link to /report?invite=1
  // — they would silently fail without this auto-open.
  const reportSearchParams = useSearchParams();
  const shouldAutoOpenInvite = viewMode === "owner" && reportSearchParams.get("invite") === "1";
  const [showInvite, setShowInvite] = useState(shouldAutoOpenInvite);
  const autoOpenedInviteRef = useRef(shouldAutoOpenInvite);
  useEffect(() => {
    if (autoOpenedInviteRef.current) return;
    if (!shouldAutoOpenInvite) return;
    autoOpenedInviteRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowInvite(true);
  }, [shouldAutoOpenInvite]);
  const clickLockUntilRef = useRef(0);

  const handleSectionClick = (sectionId: string) => {
    clickLockUntilRef.current = Date.now() + 800;
    setActiveSectionId(sectionId);
  };

  const unlockSection = (section: DisplayReportSection) => {
    // Lock-icon click intent — fired BEFORE the modal opens so funnel can
    // measure pre-paywall intent vs modal-view conversion. `plan_needed`
    // mirrors the locked section's accessTier (free tier is always unlocked
    // so it shouldn't reach this handler).
    const planNeeded: "essentials" | "full_report" | "all_reports" =
      section.accessTier === "essentials" || section.accessTier === "full_report"
        ? section.accessTier
        : "full_report";
    trackLockIconClicked({
      section_id: section.id,
      archetype: viewArchetype || null,
      plan_needed: planNeeded,
    });
    // Intent signal — user explicitly clicked a locked section. The digest
    // counts this (not auto-mount paywall_view) as "user-initiated paywall".
    trackPaywallInitiated({
      source: "lock_click",
      section_id: section.id,
      archetype: viewArchetype || null,
      plan_needed: planNeeded,
    });
    // Scope the upgrade modal to the archetype the user is currently viewing,
    // not the primary. Otherwise a buyer who already owns essentials/full on
    // primary X would see the modal flag both cards as "Your current plan"
    // when they're trying to upgrade Y.
    onOpenPricingModal(viewArchetype || null);
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

  const viewArchetypeTier = archetypeTiers[viewArchetype] ?? null;

  return (
    <main
      id="main-content"
      ref={mainContentRef}
      tabIndex={-1}
      className={`report-page${accessPlan === "full_report" || accessPlan === "all_reports" ? "" : " report-experience--sticky-pad"}`}
      style={getReportThemeStyle(theme)}
      onCopy={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
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
      {viewMode === "shared" && <SharedViewerBanner ownerFirstName={ownerFirstName} />}
      {/* Mobile nav chrome lives outside .report-page__shell-wrap so the
          modal-blur filter never becomes a containing block for these fixed
          elements. Safari (WebKit) caches the containing block once
          filter/transform is applied, stranding fixed nav mid-page after a
          modal opens. The desktop sidebar stays inside the shell grid.
          The outer div groups all of them so inert/aria-hidden still scopes
          correctly when a modal is open — no filter/transform here, so the
          containing-block bug stays gone. */}
      <div
        aria-hidden={isPricingModalOpen || isShareModalOpen || isScrollTeaserOpen}
        inert={isPricingModalOpen || isShareModalOpen || isScrollTeaserOpen}
      >
        <ReportMobileNav
          activeSectionId={activeSectionId}
          onDrawerOpened={() => {
            trackReportChapterMenuOpened({
              archetype: viewArchetype || null,
              active_section_id: activeSectionId,
            });
          }}
          onReferFriend={() => {
            trackReferFriendOpened({ source: "drawer" });
            setShowInvite(true);
          }}
          onSectionClick={handleSectionClick}
          onShareClick={
            viewMode === "owner" && ownerToken
              ? () => {
                  trackReportShareOpened({ source: "drawer" });
                  onOpenShareModal();
                }
              : undefined
          }
          sections={resolvedSections}
        />
        <div
          className={[
            "report-page__shell-wrap",
            isPricingModalOpen || isShareModalOpen
              ? "report-page__shell-wrap--obscured"
              : isScrollTeaserOpen
                ? "report-page__shell-wrap--obscured-soft"
                : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="report-shell">
            <ReportDesktopSidebar
              activeSectionId={activeSectionId}
              onReferFriend={() => {
                trackReferFriendOpened({ source: "sidebar" });
                setShowInvite(true);
              }}
              onSectionClick={handleSectionClick}
              onShareClick={
                viewMode === "owner" && ownerToken
                  ? () => {
                      trackReportShareOpened({ source: "sidebar" });
                      onOpenShareModal();
                    }
                  : undefined
              }
              sections={resolvedSections}
            />

            <div className="report-content">
              {resolvedSections.map((section) => {
                const title = section.displayTitle;
                const generalHtml = replacePlaceholders(section.generalContent, placeholderValues);
                const archetypeHtml = normalizeReportHtml(
                  section.archetypeBlockId
                    ? (archetypeContent?.[section.archetypeBlockId]?.[viewArchetype] ?? null)
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

                if (section.id === "summary") {
                  const summaryHtml = normalizeReportHtml(
                    summaryArchetypeContent[viewArchetype] ?? null
                  );
                  const isSummaryUnlocked = isSectionUnlockedForPlan({
                    accessPlan,
                    archetypeTier: viewArchetypeTier,
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
                      <DimensionSection
                        archetype={viewArchetype}
                        archetypeHtml={summaryHtml}
                        generalHtml=""
                        isPremium={section.isPremium}
                        isUnlocked={isSummaryUnlocked}
                        offerDeadline={offerDeadline}
                        onUnlock={() => unlockSection(section)}
                        quote={fullReportQuote}
                        sectionId={section.id}
                        sectionTitle={title}
                        tier="full_report"
                      />
                    </ReportSection>
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
                        onPurchaseFullReport={onPurchaseFullReport}
                        percentages={percentages}
                        primaryArchetype={primaryArchetype}
                        ranking={ranking}
                        unlockedArchetypes={unlockedArchetypes}
                        accessPlan={accessPlan}
                        diagnostics={diagnostics as { uDimensions?: Record<string, number> } | null}
                        submissionSeed={submissionSeed}
                      />
                    </ReportSection>
                  );
                }

                if (section.sectionNumber === 6) {
                  return (
                    <ReportSection
                      key={section.id}
                      feedbackWidget={feedbackWidget}
                      primaryArchetype={viewArchetype}
                      sectionId={section.id}
                      title={title}
                    >
                      <SexualStageSection
                        generalHtml={generalHtml}
                        userStageLabel={snapshot.stage}
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
                    archetypeTier: viewArchetypeTier,
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
                        isUnlocked={isBackendUnlocked}
                        offerDeadline={offerDeadline}
                        onUnlock={() => unlockSection(section)}
                        quote={fullReportQuote}
                        sectionTitle={title}
                        tier={
                          isSectionIncludedInEssentials(section.id) ? "essentials" : "full_report"
                        }
                      />
                    </ReportSection>
                  );
                }

                if (section.sectionNumber === 27) {
                  const isBackendUnlocked = isSectionUnlockedForPlan({
                    accessPlan,
                    archetypeTier: viewArchetypeTier,
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
                        content={practiceTendencies[viewArchetype] ?? null}
                        generalHtml={generalHtml}
                        isPremium={section.isPremium}
                        isUnlocked={isBackendUnlocked}
                        offerDeadline={offerDeadline}
                        onUnlock={() => unlockSection(section)}
                        quote={fullReportQuote}
                        sectionTitle={practiceSectionTitle}
                        tier={
                          isSectionIncludedInEssentials(section.id) ? "essentials" : "full_report"
                        }
                      />
                    </ReportSection>
                  );
                }

                const isBackendUnlocked = isSectionUnlockedForPlan({
                  accessPlan,
                  archetypeTier: viewArchetypeTier,
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
                      isUnlocked={isBackendUnlocked}
                      offerDeadline={offerDeadline}
                      onUnlock={() => unlockSection(section)}
                      quote={fullReportQuote}
                      sectionId={section.id}
                      sectionTitle={title}
                      tier={
                        isSectionIncludedInEssentials(section.id) ? "essentials" : "full_report"
                      }
                    />
                  </ReportSection>
                );
              })}

              <FooterSection />
            </div>
          </div>
        </div>
      </div>
      <ReportPricingModal
        accessPlan={accessPlan}
        archetype={primaryArchetype}
        archetypeTiers={archetypeTiers}
        open={isPricingModalOpen}
        onClose={onClosePricingModal}
        onUnlock={onBeginCheckout}
        quotes={pricingQuotes}
        offerDeadline={offerDeadline}
        returnFocusRef={mainContentRef}
        targetArchetype={pricingTargetArchetype}
        primaryArchetype={primaryArchetype}
        variant={pricingVariant}
      />
      {viewMode === "owner" && ownerToken ? (
        <ShareReportModal
          open={isShareModalOpen}
          onClose={onCloseShareModal}
          ownerToken={ownerToken}
          initialPlan={accessPlan}
          onUpgrade={onOpenPricingModal}
          returnFocusRef={mainContentRef}
        />
      ) : null}
      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        referrerEmail={userEmail ?? ""}
        referrerName={userName ?? ""}
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

  // Honour the discount-email CTA deep-link: /report/[token]?offer=1&pricingSessionId=<uuid>
  const isOfferLink = searchParams.get("offer") === "1";
  const pricingSessionIdFromUrl = searchParams.get("pricingSessionId");
  // Nurture-email per-user promo code, format /^LIQ-(50|75)-[A-Za-z0-9]{8}$/.
  // Validated server-side at checkout — we only stash it raw here.
  const promoFromUrl = searchParams.get("promo");

  // Persist the URL-provided pricingSessionId into sessionStorage so every
  // downstream surface (report data, /api/price, checkout, Stripe session)
  // sees the same locked quote the email was built against. Runs once per
  // navigation; harmless if the URL param is absent.
  useEffect(() => {
    if (!pricingSessionIdFromUrl) return;
    if (!token && !sessionId) return;
    setReportPricingSessionId({
      pricingSessionId: pricingSessionIdFromUrl,
      sessionId: token ? null : sessionId,
      token,
    });
  }, [pricingSessionIdFromUrl, sessionId, token]);

  // Stash the nurture promo code so the downstream checkout-session POST can
  // forward it. Server validates ownership + expiry; an invalid code silently
  // falls through to the no-promo flow.
  useEffect(() => {
    if (!promoFromUrl) return;
    if (!token && !sessionId) return;
    setReportNurturePromo({
      promoCode: promoFromUrl,
      sessionId: token ? null : sessionId,
      token,
    });
  }, [promoFromUrl, sessionId, token]);

  const { data, status, error, challenge, retry } = useReportData({
    token,
    sessionId: token ? null : sessionId,
    pricingSessionIdOverride: pricingSessionIdFromUrl,
  });
  // Pass both identifiers — the hook prefers whichever is present and the API
  // resolves the user server-side. Token is the durable identifier (works
  // cross-device); sessionId is the legacy in-storage one.
  const { feedbacks, submitted, submitFeedback } = useSectionFeedback(sessionId, token);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [pricingTargetArchetype, setPricingTargetArchetype] = useState<string | null>(null);
  const [pricingVariant, setPricingVariant] = useState<"default" | "offer" | "share">("default");
  const autoOpenedPricingRef = useRef(false);
  const autoOpenedOfferRef = useRef(false);
  const [isScrollTeaserOpen, setIsScrollTeaserOpen] = useState(false);
  const scrollTeaserFiredRef = useRef(false);
  const scrollTeaserTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPricingModalOpenRef = useRef(false);

  // Offer variant (Figma 6297-1431) is gated to the 24h+ ladder step. Before
  // step 1 every manual open shows the default pricing modal (Figma 6755-1035).
  // The discount-email deep-link (?offer=1) overrides the time gate.
  const shouldShowOfferVariant = useMemo(() => {
    if (isOfferLink) return true;
    const qs = data?.pricingQuotes;
    if (!qs) return false;
    return Object.values(qs).some((q) => q && q.discountStep >= 1);
  }, [data?.pricingQuotes, isOfferLink]);

  const viewMode: "owner" | "shared" = data?.viewMode === "shared" ? "shared" : "owner";
  const ownerFirstName = data?.ownerFirstName ?? null;
  // Prefer URL token; fall back to server-resolved owner token so session-based
  // (/report?sessionId=... or dev_session) views can also open the share modal.
  const ownerToken = viewMode === "owner" ? (token ?? data?.ownerToken ?? null) : null;

  const accessPlan = data?.accessPlan ?? null;

  // Coupled paywall experiment arm for this report. Keyed on the resolved
  // report token — URL token first, else the server-resolved owner token — so
  // session-based (/report?sessionId / dev_session) viewers land in their true
  // deterministic arm instead of silently defaulting to control. This is the
  // SAME token the pre-report wizard and the server-side checkout attribution
  // key on, so the arm is identical across wizard, report, and purchase.
  // Treatment ⇒ the scroll-triggered pricing modal is non-closable (must pay).
  // `?arm=` is a dev-only preview override (null in production).
  const devArm = useMemo(() => resolveDevCohortOverride(searchParams.get("arm")), [searchParams]);
  const resolvedReportToken = token ?? data?.ownerToken ?? null;
  // A visit that arrived from one of our email links always gets the soft
  // "control" experience (dismissible modal, blurred premium sections) instead
  // of the forced hard wall — re-engagement should never trap a returning user
  // behind a paywall they can't close. `utm_source=email` covers emails already
  // sitting in inboxes (nurture + chapter-nudge carry it today); `from=email` is
  // the explicit, analytics-independent signal added to every report link.
  const fromEmail =
    searchParams.get("from") === "email" || searchParams.get("utm_source") === "email";
  // `forced_paywall_enabled` OFF (server flag) hard-pauses the forced screen:
  // everyone lands in "control" (dismissible modal, report viewable) regardless
  // of the token-derived arm. Existing email-return / dev-override rules still
  // apply within the enabled path.
  const forcedPaywallCohort = useMemo(
    () =>
      data?.forcedPaywallEnabled === false
        ? "control"
        : resolveReportPaywallCohort({ devArm, fromEmail, token: resolvedReportToken }),
    [data?.forcedPaywallEnabled, devArm, fromEmail, resolvedReportToken]
  );

  // Resolve the paywall countdown deadline once per report session (client-only;
  // reads/creates a sessionStorage entry keyed by token/session). Kept out of the
  // render path so it can't cause a hydration mismatch. The 2-minute window then
  // survives view switches + reopening the modal within the tab.
  const [offerDeadline, setOfferDeadline] = useState<number | undefined>(undefined);
  const offerDeadlineSetRef = useRef(false);
  useEffect(() => {
    // Resolve the deadline exactly once, as soon as a stable storage key exists
    // (token or session). Re-resolving when `ownerToken` arrives later for
    // session-based access would key a different sessionStorage entry and make
    // the visible timer jump — so we lock it in on the first stable key.
    if (offerDeadlineSetRef.current) return;
    if (!resolvedReportToken && !sessionId) return;
    offerDeadlineSetRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only sessionStorage read, fires once
    setOfferDeadline(getReportPaywallDeadline({ token: resolvedReportToken, sessionId }));
  }, [resolvedReportToken, sessionId]);

  // Fire one "countdown expired" event when the shared 2-minute urgency timer
  // elapses DURING this session — only if time actually remained at resolve and
  // the report is still locked. Returning visitors who land after it already
  // expired never schedule it; a purchase mid-session cancels it (dep re-run).
  const countdownExpiredFiredRef = useRef(false);
  useEffect(() => {
    if (countdownExpiredFiredRef.current) return;
    if (offerDeadline == null) return;
    const plan = data?.accessPlan;
    if (plan === "full_report" || plan === "all_reports") return;
    const msLeft = offerDeadline - Date.now();
    if (msLeft <= 0) return;
    const id = window.setTimeout(() => {
      countdownExpiredFiredRef.current = true;
      trackPaywallCountdownExpired(data?.primaryArchetype ?? null);
    }, msLeft);
    return () => window.clearTimeout(id);
  }, [offerDeadline, data?.accessPlan, data?.primaryArchetype]);

  // Single guarded closer for the scroll teaser. For the forced (treatment)
  // arm the teaser must only be exitable via checkout, so every other close
  // path routes through here and becomes a no-op. Checkout closes it directly.
  // (The page behind the open teaser is also `inert`, so these alternate
  // surfaces are unreachable while it's open — this enforces the contract even
  // if that guard is ever changed.)
  const dismissScrollTeaser = useCallback(() => {
    if (forcedPaywallCohort !== "treatment") setIsScrollTeaserOpen(false);
  }, [forcedPaywallCohort]);

  const reportViewedFiredRef = useRef(false);
  useEffect(() => {
    if (reportViewedFiredRef.current) return;
    if (!data) return;
    reportViewedFiredRef.current = true;
    setReportSubmissionContext(data.submissionId ?? null);
    // Stamp the arm BEFORE the first persisted event so every report-page
    // analytics row self-identifies its forced-paywall arm.
    setForcedPaywallArm(forcedPaywallCohort);
    trackReportViewed(accessPlan ?? "locked", data.primaryArchetype ?? null);
  }, [data, accessPlan, forcedPaywallCohort]);

  useReportEngagementTimers({
    reportType: data ? (accessPlan ?? "locked") : null,
    archetype: data?.primaryArchetype ?? null,
  });

  useEffect(() => {
    if (autoOpenedPricingRef.current) return;
    if (!data) return;
    if (viewMode === "shared") return;
    if (accessPlan !== null) return;
    // Treatment (forced) arm shows the non-closable teaser immediately instead
    // of this closable discount-offer modal — don't let it preempt the paywall.
    // Consume the one-shot ref so a later cohort flip can't double-open it.
    if (forcedPaywallCohort === "treatment") {
      autoOpenedPricingRef.current = true;
      return;
    }
    // Only auto-open when the discount ladder has progressed (24h+ since
    // survey). At step 0 (just finished the report) the modal stays closed —
    // user opens it explicitly via locked-section CTAs or archetype tiles.
    const quotes = data.pricingQuotes;
    const hasLadderDiscount =
      !!quotes && Object.values(quotes).some((quote) => quote && quote.discountStep >= 1);
    if (!hasLadderDiscount) return;
    autoOpenedPricingRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsScrollTeaserOpen(false);
    setPricingVariant("offer");
    setIsPricingModalOpen(true);
  }, [accessPlan, data, viewMode, forcedPaywallCohort]);

  useEffect(() => {
    if (!isOfferLink) return;
    if (autoOpenedOfferRef.current) return;
    if (!data) return;
    // One-shot: once data has resolved for this offer-link visit, consume the
    // ref so a later cohort/access flip can't double-open the modal.
    autoOpenedOfferRef.current = true;
    // Paid customers, shared (recipient) views, and the forced (treatment) hard
    // wall must NOT get the closable offer modal auto-opened. A paying customer
    // who clicks an old nurture link from their inbox lands on their report, not
    // a checkout prompt; tier upgrades happen on demand via locked-section CTAs.
    if (
      !shouldAutoOpenOfferModal({
        isOfferLink,
        accessPlan,
        viewMode,
        cohort: forcedPaywallCohort,
      })
    ) {
      return;
    }
    // Intent signal — user clicked an email-deep-link to land here. Counts
    // as user-initiated paywall surface (clicked the link in an email).
    trackPaywallInitiated({ source: "offer_link", archetype: null });
    // Discount email deep-link — open the pricing modal in offer variant.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsScrollTeaserOpen(false);
    setPricingTargetArchetype(null);
    setPricingVariant("offer");
    setIsPricingModalOpen(true);
  }, [data, isOfferLink, viewMode, forcedPaywallCohort, accessPlan]);

  useEffect(() => {
    isPricingModalOpenRef.current = isPricingModalOpen;
  }, [isPricingModalOpen]);

  useEffect(() => {
    if (!data) return;
    if (accessPlan !== null) return;
    if (viewMode === "shared") return;

    // Treatment (forced) arm: open the paywall immediately on load — no scroll
    // wait — and skip the scroll listener entirely.
    if (forcedPaywallCohort === "treatment") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsScrollTeaserOpen(true);
      return;
    }

    function handleFirstScroll() {
      if (scrollTeaserFiredRef.current) return;
      scrollTeaserFiredRef.current = true;
      window.removeEventListener("scroll", handleFirstScroll);
      scrollTeaserTimerRef.current = setTimeout(() => {
        if (!isPricingModalOpenRef.current) {
          // Pricing 2.0: the scroll pop-up shows the NEW 3-tier plans modal
          // (ReportPricingModal), not the old single-price teaser — the same
          // modal the locked-section "Unlock" CTAs open, so scroll and click
          // are consistent.
          setPricingTargetArchetype(null);
          setPricingVariant(shouldShowOfferVariant ? "offer" : "default");
          setIsPricingModalOpen(true);
        }
      }, 1000);
    }

    window.addEventListener("scroll", handleFirstScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleFirstScroll);
      if (scrollTeaserTimerRef.current) {
        clearTimeout(scrollTeaserTimerRef.current);
        scrollTeaserTimerRef.current = null;
      }
      scrollTeaserFiredRef.current = false;
    };
  }, [accessPlan, data, viewMode, forcedPaywallCohort, shouldShowOfferVariant]);

  // Experiment exposure — fire once when this report is eligible for the
  // forced-paywall test (locked + owner view). Both arms, for arm analysis.
  const paywallExposureFiredRef = useRef(false);
  useEffect(() => {
    if (paywallExposureFiredRef.current) return;
    if (!data) return;
    if (accessPlan !== null) return;
    if (viewMode === "shared") return;
    paywallExposureFiredRef.current = true;
    trackExperimentExposure({
      experiment: FORCED_PAYWALL_EXPERIMENT,
      variant: forcedPaywallCohort,
      surface: "report_scroll_paywall",
    });
  }, [accessPlan, data, viewMode, forcedPaywallCohort]);

  const apiUnlocked = data?.unlockedArchetypes;
  const primaryArchetypeFromData = data?.primaryArchetype;
  const unlockedArchetypes = useMemo(() => {
    const set = new Set<string>();
    if (apiUnlocked) {
      for (const name of apiUnlocked) set.add(name);
    }
    if (primaryArchetypeFromData) set.add(primaryArchetypeFromData);
    return set;
  }, [apiUnlocked, primaryArchetypeFromData]);

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

      // Intent signal — user clicked "Unlock" on an archetype probability tile.
      trackPaywallInitiated({ source: "archetype_unlock", archetype: name });
      dismissScrollTeaser();
      setPricingTargetArchetype(name === primaryArchetypeFromData ? null : name);
      setPricingVariant(shouldShowOfferVariant ? "offer" : "default");
      setIsPricingModalOpen(true);
    },
    [
      devParam,
      dismissScrollTeaser,
      pathname,
      primaryArchetypeFromData,
      returnToPrimaryHref,
      router,
      shouldShowOfferVariant,
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
    // Essentials + Full Report are per-archetype; All Reports is a global
    // unlock so it stays archetype-less.
    const archetypeForCheckout = plan === "all_reports" ? null : (archetype ?? null);
    router.push(buildReportCheckoutHref({ archetype: archetypeForCheckout, plan, token }));
  };

  // Footer "Unlock the Full Report" CTA on the archetype breakdown section —
  // skips the pricing modal and routes straight to Stripe checkout for the
  // full_report plan, attributed to the user's primary archetype. Kept as a
  // plain function (not useCallback) because beginCheckout is also a plain
  // function ref that changes every render — wrapping this in useCallback
  // with beginCheckout in deps would defeat memoization. The button fires
  // once on click; child re-renders triggered by a new callback identity are
  // cheap (no memoized children below this in the tree).
  const handlePurchaseFullReport = () => {
    // Footer CTA on the "Other Archetypes" breakdown. For a user who already
    // owns full_report (their PRIMARY archetype), "the full report" is theirs —
    // the only thing still locked in this section is the OTHER archetypes, which
    // all_reports unlocks. So route full_report owners to all_reports; everyone
    // else (no plan / essentials) buys full_report. all_reports is a global
    // unlock, so it carries no archetype (beginCheckout nulls it too).
    const plan: ReportPurchasePlanId = accessPlan === "full_report" ? "all_reports" : "full_report";
    const archetype = plan === "all_reports" ? null : primaryArchetype;
    trackPaywallInitiated({
      source: "archetype_breakdown_footer",
      archetype,
      plan_needed: plan,
    });
    beginCheckout(plan, archetype);
  };

  const closePricingModal = useCallback(() => {
    setIsPricingModalOpen(false);
    setPricingTargetArchetype(null);
    setPricingVariant("default");
  }, []);

  const openShareModal = useCallback(() => {
    // Free-plan users see the pricing modal in "share" variant instead of the
    // share form — they have nothing to share until they purchase a plan.
    if (!canSharePlan(accessPlan)) {
      dismissScrollTeaser();
      setPricingTargetArchetype(null);
      setPricingVariant("share");
      setIsPricingModalOpen(true);
      return;
    }
    setIsShareModalOpen(true);
  }, [accessPlan, dismissScrollTeaser]);
  const closeShareModal = useCallback(() => setIsShareModalOpen(false), []);
  const openPricingModal = useCallback(
    (archetype?: string | null) => {
      // Scope the modal to the archetype the user is currently upgrading. If
      // a caller doesn't pass one, fall back to whichever archetype is being
      // viewed (locked-section CTAs in /report?archetype=Y must upgrade Y,
      // not primary). null = primary archetype.
      const scope = archetype ?? null;
      dismissScrollTeaser();
      setPricingTargetArchetype(scope && scope !== primaryArchetypeFromData ? scope : null);
      setPricingVariant(shouldShowOfferVariant ? "offer" : "default");
      setIsPricingModalOpen(true);
    },
    [dismissScrollTeaser, primaryArchetypeFromData, shouldShowOfferVariant]
  );

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

  if (status === "needs_verification" && token) {
    return (
      <ShareVerifyGate
        shareToken={token}
        ownerFirstName={challenge?.ownerFirstName ?? null}
        recipientEmailHint={challenge?.recipientEmailHint ?? null}
        onVerified={() => retry()}
      />
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

  const handleTeaserCheckout = () => {
    setIsScrollTeaserOpen(false);
    beginCheckout("full_report", effectiveViewArchetype);
  };

  // One shared countdown ticker for the whole locked report — drives the locked
  // chapter cards AND the pricing modal (it reads the value through the portal
  // via React context) from a single interval, so every timer shows the exact
  // same MM:SS. Active while the report isn't fully unlocked.
  const reportLocked = data.accessPlan !== "full_report" && data.accessPlan !== "all_reports";

  return (
    <PaywallCountdownProvider deadline={offerDeadline ?? null} active={reportLocked}>
      <ReportExperience
        key={`${token ?? "browser"}:${sessionId ?? "anon"}`}
        devParam={devParam}
        accessPlan={data.accessPlan}
        archetypeTiers={data.archetypeTiers ?? {}}
        diagnostics={diagnostics}
        submissionSeed={data.submissionId ?? token ?? null}
        feedbacks={feedbacks}
        isPricingModalOpen={isPricingModalOpen}
        isScrollTeaserOpen={isScrollTeaserOpen}
        isShareModalOpen={isShareModalOpen}
        matchScore={matchScore}
        offerDeadline={offerDeadline}
        onBeginCheckout={beginCheckout}
        onClosePricingModal={closePricingModal}
        onCloseShareModal={closeShareModal}
        onOpenShareModal={openShareModal}
        onOpenPricingModal={openPricingModal}
        onUnlockArchetype={handleUnlockArchetype}
        onPurchaseFullReport={handlePurchaseFullReport}
        ownerFirstName={ownerFirstName}
        ownerToken={ownerToken}
        percentages={percentages}
        placeholderValues={placeholderValues}
        primaryArchetype={primaryArchetype}
        pricingQuotes={data.pricingQuotes}
        archetypeContent={data.archetypeContent ?? {}}
        practiceTendencies={data.practiceTendencies ?? {}}
        pricingTargetArchetype={pricingTargetArchetype}
        pricingVariant={pricingVariant}
        ranking={ranking}
        reportDate={reportDate}
        resolvedSections={resolvedSections}
        snapshot={snapshot}
        submitFeedback={submitFeedback}
        submitted={submitted}
        theme={theme}
        unlockedArchetypes={unlockedArchetypes}
        userEmail={data.userEmail}
        userName={data.userName}
        viewArchetype={effectiveViewArchetype}
        viewMode={viewMode}
      />
      <ScrollPricingModal
        open={isScrollTeaserOpen}
        onClose={dismissScrollTeaser}
        onCheckout={handleTeaserCheckout}
        userName={data.userName}
        quote={data.pricingQuotes?.full_report ?? null}
        dismissible={forcedPaywallCohort !== "treatment"}
        offerDeadline={offerDeadline}
      />
      {data.accessPlan !== "full_report" && data.accessPlan !== "all_reports" && (
        <ReportStickyUnlockBar
          quote={data.pricingQuotes?.full_report ?? null}
          onCheckout={() => beginCheckout("full_report", effectiveViewArchetype)}
          hidden={isPricingModalOpen || isShareModalOpen || isScrollTeaserOpen}
          archetype={effectiveViewArchetype}
        />
      )}
    </PaywallCountdownProvider>
  );
};

export default ReportPage;
