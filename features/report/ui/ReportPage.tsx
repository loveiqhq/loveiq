"use client";

import {
  Fragment,
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
import MeansForYouSection from "./sections/MeansForYouSection";
import type { PartnershipLoop } from "@/data/report2-partnership-loops";
import type { ReportNavAccess } from "./ReportNavBadge";
import {
  REPORT_NAV_PARTS,
  REPORT_PART_FIRST_SECTION,
  REPORT_SECTION_ORDER,
  RETIRED_REPORT_SECTION_IDS,
} from "./reportNav";
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
import AttachmentPatternsSection, {
  type AttachmentCopy,
  type AttachmentPlane,
} from "./sections/AttachmentPatternsSection";
import AcceleratorsSection, { type AccelCopy } from "./sections/AcceleratorsSection";
import BeliefsSection, { type BeliefsCopy } from "./sections/BeliefsSection";
import ConfidenceSection, {
  type ConfidenceCopy,
  type ConfidenceStrip,
} from "./sections/ConfidenceSection";
import ConstellationSection from "./sections/ConstellationSection";
import CoreArchetypeSection from "./sections/CoreArchetypeSection";
import DimensionSection from "./sections/DimensionSection";
import EnergySection, { type EnergyCopy, type EnergyConfig } from "./sections/EnergySection";
import ArousalSection, { type ArousalCopy, type ArousalConfig } from "./sections/ArousalSection";
import InitiationSection, {
  type InitiationCopy,
  type InitiationConfig,
} from "./sections/InitiationSection";
import LibidoSection, { type LibidoCopy, type LibidoConfig } from "./sections/LibidoSection";
import PartnershipSection, { type PartnershipCopy } from "./sections/PartnershipSection";
import EnjoymentSection, { type EnjoyCopy } from "./sections/EnjoymentSection";
import ClosingSection from "./sections/ClosingSection";
import GrowthSection, { type GrowthCopy } from "./sections/GrowthSection";
import ReadingSection, { type ReadingCopy } from "./sections/ReadingSection";
import FindingsSection, { type FindingsCopy } from "./sections/FindingsSection";
import ImportanceOfSexualitySection from "./sections/ImportanceOfSexualitySection";
import InsecuritiesSection, {
  type InsecuritiesCopy,
  type InsecurityGraph,
} from "./sections/InsecuritiesSection";
import InsightMapSection, { type MapCopy } from "./sections/InsightMapSection";
import CuriositySection, { type CuriosityCopy } from "./sections/CuriositySection";
import FantasySection, { type FantasyCopy } from "./sections/FantasySection";
import type { FantasyMapDot } from "@features/report/server/fantasyMap";
import LoveLanguageSection, { type LoveLanguageCopy } from "./sections/LoveLanguageSection";
import PowerSection, { type PowerCopy } from "./sections/PowerSection";
import PracticeTendenciesSection from "./sections/PracticeTendenciesSection";
import RewardSection, { type RewardCopy, type RewardConfig } from "./sections/RewardSection";
import SexualStageSection, { type StageCopy } from "./sections/SexualStageSection";
import SnapshotSection, { type SnapshotCopy } from "./sections/SnapshotSection";
import ReportPartDivider, { type ReportPartDividerProps } from "./sections/ReportPartDivider";
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

// Report 2.0 part dividers (Figma 8427:794 / 1440 / 1751 / 2554) — the big
// centered "PART N" heading that opens each part.
//
// Keyed by section ID, not sectionNumber: the body is ordered by
// REPORT_SECTION_ORDER (the Figma order), which deliberately does NOT follow
// the numbering, so a numeric key would drop the divider in the wrong place.
const REPORT_PART_DIVIDER_BY_SECTION: Record<string, ReportPartDividerProps> = {
  [REPORT_PART_FIRST_SECTION.partI]: {
    part: "Part I",
    lead: "Your ",
    accent: "Core",
    tail: " Archetype",
  },
  [REPORT_PART_FIRST_SECTION.partII]: { part: "Part II", lead: "How you ", accent: "work" },
  [REPORT_PART_FIRST_SECTION.partIII]: { part: "Part III", lead: "Your erotic ", accent: "engine" },
  [REPORT_PART_FIRST_SECTION.partIV]: { part: "Part IV", lead: "Your growth edges" },
};

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
  snapshotCopy: SnapshotCopy | null;
  findingsCopy: FindingsCopy | null;
  beliefsCopy: BeliefsCopy | null;
  attachmentCopy: AttachmentCopy | null;
  attachmentFamily: string | null;
  attachmentPlane: AttachmentPlane | null;
  accelCopy: AccelCopy | null;
  insecuritiesCopy: InsecuritiesCopy | null;
  insecurityCueFamily: string | null;
  insecurityGraph: InsecurityGraph | null;
  rewardCopy: RewardCopy | null;
  rewardConfig: RewardConfig | null;
  energyCopy: EnergyCopy | null;
  energyConfig: EnergyConfig | null;
  arousalCopy: ArousalCopy | null;
  arousalConfig: ArousalConfig | null;
  initiationCopy: InitiationCopy | null;
  initiationConfig: InitiationConfig | null;
  libidoCopy: LibidoCopy | null;
  libidoConfig: LibidoConfig | null;
  partnershipCopy: PartnershipCopy | null;
  partnershipLoop: PartnershipLoop | null;
  enjoyCopy: EnjoyCopy | null;
  growthCopy: GrowthCopy | null;
  growthRungs: number | null;
  readingCopy: ReadingCopy | null;
  powerCopy: PowerCopy | null;
  fantasyCopy: FantasyCopy | null;
  fantasyDots: FantasyMapDot[] | null;
  curiosityCopy: CuriosityCopy | null;
  relationshipFit: Record<string, number> | null;
  lovelangCopy: LoveLanguageCopy | null;
  loveLanguageOrder: string[] | null;
  confidenceCopy: ConfidenceCopy | null;
  confidenceStrip: ConfidenceStrip | null;
  mapCopy: MapCopy | null;
  stageCopy: StageCopy | null;
  constellationMottos: Record<string, string | null>;
  submitFeedback: (sectionId: string, payload: FeedbackPayload) => void;
  submitted: Record<string, boolean>;
  theme: ReturnType<typeof getReportTheme>;
  userEmail: string | null;
  userName: string | null;
  viewArchetype: string;
  viewMode: "owner" | "shared";
}

const ReportExperience: FC<ReportExperienceProps> = ({
  accessPlan,
  archetypeTiers,
  devParam,
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
  snapshotCopy,
  findingsCopy,
  beliefsCopy,
  attachmentCopy,
  attachmentFamily,
  attachmentPlane,
  accelCopy,
  insecuritiesCopy,
  insecurityCueFamily,
  insecurityGraph,
  rewardCopy,
  rewardConfig,
  energyCopy,
  energyConfig,
  arousalCopy,
  arousalConfig,
  initiationCopy,
  initiationConfig,
  libidoCopy,
  libidoConfig,
  partnershipCopy,
  partnershipLoop,
  enjoyCopy,
  growthCopy,
  growthRungs,
  readingCopy,
  powerCopy,
  fantasyCopy,
  fantasyDots,
  curiosityCopy,
  relationshipFit,
  lovelangCopy,
  loveLanguageOrder,
  confidenceCopy,
  confidenceStrip,
  mapCopy,
  stageCopy,
  constellationMottos,
  submitFeedback,
  submitted,
  theme,
  userEmail,
  userName,
  viewArchetype,
  viewMode,
}) => {
  const mainContentRef = useRef<HTMLElement | null>(null);
  const [activeSectionId, setActiveSectionId] = useState(
    resolvedSections[0]?.id ?? "core_archetype"
  );
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

  // Findings section unlock CTA (locked f3-5 upsell). Mirrors unlockSection's
  // intent signal, then opens the shared pricing modal scoped to the viewed
  // archetype — no bespoke checkout. full_report is the plan that unlocks the
  // gated findings.
  const unlockFindings = () => {
    trackLockIconClicked({
      section_id: "findings",
      archetype: viewArchetype || null,
      plan_needed: "full_report",
    });
    trackPaywallInitiated({
      source: "lock_click",
      section_id: "findings",
      archetype: viewArchetype || null,
      plan_needed: "full_report",
    });
    onOpenPricingModal(viewArchetype || null);
  };

  // Insight Map pill CTAs ("See what quietly shuts it down →", etc.) share the
  // Findings unlock path: they open the shared pricing modal scoped to the
  // viewed archetype. full_report unlocks the pattern sections these tease.
  const unlockMap = () => {
    trackLockIconClicked({
      section_id: "map",
      archetype: viewArchetype || null,
      plan_needed: "full_report",
    });
    trackPaywallInitiated({
      source: "lock_click",
      section_id: "map",
      archetype: viewArchetype || null,
      plan_needed: "full_report",
    });
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
      let activeId = sectionTops[0]?.id ?? resolvedSections[0]?.id ?? "core_archetype";
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

  // Nav access badges (Figma locked page, Aside 8993:19278): a `FREE` chip on
  // open chapters, a padlock on gated ones. Derived from the SAME gate the
  // sections use, so the nav can never disagree with what actually opens.
  //
  // EVERY nav item gets an entry — a bought chapter resolves to "unlocked" (an
  // open padlock) rather than dropping out of the map. Nav ids with no matching
  // section (`snapshot`, `map`, `constellation` — the redesign-added anchors)
  // are free by construction.
  const navAccessById = useMemo(() => {
    const access = new Map<string, ReportNavAccess>();
    for (const part of REPORT_NAV_PARTS) {
      for (const item of part.items) {
        const section = resolvedSections.find((s) => s.id === (item.gateId ?? item.id));
        if (!section?.isPremium) {
          access.set(item.id, "free");
          continue;
        }
        const unlocked = isSectionUnlockedForPlan({
          accessPlan,
          archetypeTier: viewArchetypeTier,
          isPremium: section.isPremium,
          sectionId: section.id,
        });
        access.set(item.id, unlocked ? "unlocked" : "locked");
      }
    }
    return access;
  }, [resolvedSections, accessPlan, viewArchetypeTier]);

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
          accessById={navAccessById}
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
              accessById={navAccessById}
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
            />

            <div className="report-content">
              {resolvedSections.map((section) => {
                const partDivider = REPORT_PART_DIVIDER_BY_SECTION[section.id];
                const sectionNode = (() => {
                  const title = section.displayTitle;
                  const generalHtml = replacePlaceholders(
                    section.generalContent,
                    placeholderValues
                  );
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
                    // The Snapshot section renders directly AFTER the Core
                    // Archetype (Hero) with the same ReportSection reveal + nav
                    // treatment (Figma 8719:8871). It has no standalone entry in
                    // the section list, so it's mounted here as the Hero's
                    // sibling and given its own scroll-anchored id.
                    return (
                      <Fragment key={section.id}>
                        <ReportSection
                          feedbackWidget={feedbackWidget}
                          primaryArchetype={viewArchetype}
                          sectionId={section.id}
                          title={title}
                        >
                          <CoreArchetypeSection matchScore={matchScore} theme={theme} />
                        </ReportSection>
                        {/* "What this means for you" (Figma 8719:8865). Part I's
                          child order is HERO → SUMMARY → SNAPSHOT, so this sits
                          between the card and Your Snapshot. Free + universal;
                          renders nothing for archetypes with no verified copy. */}
                        <ReportSection
                          primaryArchetype={viewArchetype}
                          sectionId="means_for_you"
                          title=""
                        >
                          <MeansForYouSection archetype={viewArchetype} />
                        </ReportSection>
                        {/* Empty title suppresses ReportSection's own large
                          header (hidden via CSS on #snapshot) — SnapshotSection
                          renders its own 29px "Your snapshot" heading per the
                          Figma. The wrapper is only here for scroll-reveal +
                          the #snapshot anchor + the section divider. */}
                        <ReportSection
                          primaryArchetype={viewArchetype}
                          sectionId="snapshot"
                          title=""
                        >
                          <SnapshotSection
                            archetype={viewArchetype}
                            copy={snapshotCopy}
                            stageResult={stageCopy?.result ?? null}
                          />
                        </ReportSection>
                        {/* Findings renders directly after Snapshot with the same
                          reveal treatment (Figma 8501:683). Locked findings
                          (f3-5, unpaid) arrive server-stripped to teaser text;
                          the unlock CTA reuses the shared pricing-modal path. */}
                        <ReportSection
                          primaryArchetype={viewArchetype}
                          sectionId="findings"
                          title=""
                        >
                          <FindingsSection copy={findingsCopy} onUnlock={() => unlockFindings()} />
                        </ReportSection>
                        {/* Insight Map renders directly after Findings with the
                          same reveal treatment (Figma 8762:15822). Fully visible
                          (featured tile is "always unlocked"); pill CTAs reuse
                          the shared pricing-modal path. */}
                        <ReportSection primaryArchetype={viewArchetype} sectionId="map" title="">
                          <InsightMapSection
                            archetype={viewArchetype}
                            copy={mapCopy}
                            onUnlock={() => unlockMap()}
                          />
                        </ReportSection>
                      </Fragment>
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
                        <SexualStageSection userStageLabel={snapshot.stage} copy={stageCopy} />
                      </ReportSection>
                    );
                  }

                  if (section.sectionNumber === 7) {
                    return (
                      <Fragment key={section.id}>
                        <ReportSection
                          feedbackWidget={feedbackWidget}
                          primaryArchetype={viewArchetype}
                          sectionId={section.id}
                          title={title}
                        >
                          <ImportanceOfSexualitySection
                            archetype={viewArchetype}
                            importanceValue={snapshot.importanceValue}
                          />
                        </ReportSection>
                        {/* Constellation ("Other Archetypes") is the LAST free
                          Part I section — mounted here as Importance's sibling so
                          it renders directly after it (Hero…→Stage→Importance→
                          Constellation), just before Part II (attachment, sec 8+)
                          begins. Empty title suppresses ReportSection's own header
                          (hidden via CSS on #constellation); the section renders
                          its own "You're a constellation…" heading per Figma
                          8427:1070. The wrapper only provides scroll-reveal + the
                          #constellation anchor + the section divider. Free — no
                          gating; every archetype's row shows its own motto and
                          links to that archetype's report (unlock-gated on click).*/}
                        <ReportSection
                          primaryArchetype={viewArchetype}
                          sectionId="constellation"
                          title=""
                        >
                          <ConstellationSection
                            ranking={ranking}
                            percentages={percentages}
                            mottos={constellationMottos}
                            viewArchetype={viewArchetype}
                            onViewArchetype={onUnlockArchetype}
                          />
                        </ReportSection>
                      </Fragment>
                    );
                  }

                  if (section.sectionNumber === 8) {
                    // Report 2.0 "Attachment Style" — a Part II, essentials-tier
                    // PREMIUM section. Gating is resolved SERVER-SIDE: a locked
                    // client's attachmentCopy carries only the universal slots
                    // (result/row-values/insight/body/plane withheld), and
                    // `attachmentCopy.locked` mirrors this unlock check. The row2/
                    // row3 labels are family-specific (attachmentFamily). Only the
                    // primary archetype gets a copy block; when browsing another
                    // archetype's report the section falls back to null (renders
                    // nothing) — same handoff as beliefs/accel/stage.
                    const isPrimaryView = viewArchetype === primaryArchetype;
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
                          copy={isPrimaryView ? attachmentCopy : null}
                          plane={isPrimaryView ? attachmentPlane : null}
                          family={isPrimaryView ? attachmentFamily : null}
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

                  if (section.sectionNumber === 9) {
                    // Report 2.0 "Core Insecurities" — a Part II, essentials-tier
                    // PREMIUM section. Gating is resolved SERVER-SIDE: a locked
                    // client's insecuritiesCopy carries only the universal slots
                    // (gate.hook, practical.label, learn.*) — the per-archetype
                    // takeaway/practical-lines/body AND the cue family + graph
                    // config are withheld — and `insecuritiesCopy.locked` mirrors
                    // this unlock check. The cue graph highlights the reader's
                    // family curve + labels its axes (config `insecurity_graph`
                    // wins; else the family map). Only the primary archetype gets
                    // a copy block; browsing another archetype's report renders
                    // nothing. Empty title suppresses ReportSection's header
                    // (hidden via CSS on #core_insecurities) — the section renders
                    // its own "Core Insecurities" heading per Figma 8427:1517.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <InsecuritiesSection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? insecuritiesCopy : null}
                          cueFamily={isPrimaryView ? insecurityCueFamily : null}
                          graph={isPrimaryView ? insecurityGraph : null}
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

                  if (section.sectionNumber === 12) {
                    // Report 2.0 "Reward System" — a Part III, FULL_REPORT-tier
                    // PREMIUM section (NOT in ESSENTIALS_SECTION_IDS, so it unlocks
                    // only at full_report). Gating is resolved SERVER-SIDE: a
                    // locked client's rewardCopy carries only the universal
                    // educational slots + stat (the per-archetype takeaway AND the
                    // reward config — chemical order/roles/meters — are withheld),
                    // and `rewardCopy.locked` mirrors this unlock check. Only the
                    // primary archetype gets a copy block; browsing another
                    // archetype's report renders nothing. Empty title suppresses
                    // ReportSection's header (hidden via CSS on
                    // #biochemical_reward_system_dynamics) — the section renders its
                    // own "Reward System" heading per Figma 8427:1758.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <RewardSection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? rewardCopy : null}
                          config={isPrimaryView ? rewardConfig : null}
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

                  if (section.sectionNumber === 13) {
                    // Report 2.0 "Energy & Risk" — a Part III, FULL_REPORT-tier
                    // PREMIUM section (energy_level; NOT in ESSENTIALS_SECTION_IDS,
                    // so it unlocks only at full_report). Gating is resolved
                    // SERVER-SIDE: a locked client's energyCopy carries only the
                    // universal educational slots + chart caption (the per-archetype
                    // gate.hook AND takeaway AND the energy config — curve family +
                    // readout levels — are withheld), and `energyCopy.locked` mirrors
                    // this unlock check. Only the primary archetype gets a copy
                    // block; browsing another archetype's report renders nothing.
                    // Empty title suppresses ReportSection's header (hidden via CSS
                    // on #energy_level) — the section renders its own "Energy & Risk"
                    // heading per Figma 8427:1843.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <EnergySection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? energyCopy : null}
                          config={isPrimaryView ? energyConfig : null}
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

                  if (section.sectionNumber === 15) {
                    // Report 2.0 "Power Orientation" — a Part III, FULL_REPORT-tier
                    // PREMIUM section (power_orientation; NOT in
                    // ESSENTIALS_SECTION_IDS, so it unlocks only at full_report).
                    // Gating is resolved SERVER-SIDE: a locked client's powerCopy
                    // carries only the universal educational slots + hook (the
                    // per-archetype takeaway, body, and the reader's power-zone /
                    // "You" highlight are withheld), and `powerCopy.locked` mirrors
                    // this unlock check. The 14-dot power plane is a FIXED universal
                    // layout (same positions for everyone) so it still draws when
                    // locked, minus the "You" highlight. Only the primary archetype
                    // gets a copy block; browsing another archetype renders nothing.
                    // Empty title suppresses ReportSection's header (hidden via CSS
                    // on #power_orientation) — the section renders its own "Power
                    // Orientation" heading per Figma 8427:1947.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <PowerSection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? powerCopy : null}
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

                  if (section.sectionNumber === 16) {
                    // Report 2.0 "Curiosity & Relationship Form" — a Part III,
                    // FULL_REPORT-tier PREMIUM section (curiosity_level; NOT in
                    // ESSENTIALS_SECTION_IDS, so it unlocks only at full_report).
                    // Gating is resolved SERVER-SIDE: a locked client's
                    // curiosityCopy carries only the universal educational slots +
                    // hook + the universal 14-item struct list (the per-archetype
                    // takeaway/body + the reader's relationship-fit scores are
                    // withheld), and `curiosityCopy.locked` mirrors this unlock
                    // check. Only Spiritual Lover carries `relationship_fit` today;
                    // the others render the fit table's universal form labels
                    // WITHOUT dots rather than fabricating. Only the primary
                    // archetype gets a copy block; browsing another renders nothing.
                    // Empty title suppresses ReportSection's header (hidden via CSS
                    // on #curiosity_level) — the section renders its own "Curiosity
                    // & Relationship Form" heading per Figma 8427:2004.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <CuriositySection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? curiosityCopy : null}
                          relationshipFit={isPrimaryView ? relationshipFit : null}
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

                  if (section.sectionNumber === 19) {
                    // Report 2.0 "Love Language" — a Part III, FULL_REPORT-tier
                    // PREMIUM section (love_language; NOT in ESSENTIALS_SECTION_IDS,
                    // so it unlocks only at full_report). Gating is resolved
                    // SERVER-SIDE: a locked client's lovelangCopy carries only the
                    // universal educational slots + hook (the per-archetype `body.p1`
                    // "catch" line + the reader's `love_language_order` are withheld),
                    // and `lovelangCopy.locked` mirrors this unlock check. The five
                    // languages are universal; only their ORDER varies, and only some
                    // archetypes carry one — the rest render the framing + edu WITHOUT
                    // the ranked list rather than fabricating. Only the primary
                    // archetype gets a copy block; browsing another renders nothing.
                    // Empty title suppresses ReportSection's header (hidden via CSS on
                    // #love_language) — the section renders its own "Love Language"
                    // heading per Figma 8427:2096.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <LoveLanguageSection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? lovelangCopy : null}
                          order={isPrimaryView ? loveLanguageOrder : null}
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

                  if (section.sectionNumber === 21) {
                    // Report 2.0 "Arousal Style" — a Part III, FULL_REPORT-tier
                    // PREMIUM section (arousal_style; NOT in ESSENTIALS_SECTION_IDS,
                    // so it unlocks only at full_report). Mounts in Part III right
                    // after Love Language (19). Gating is resolved SERVER-SIDE: a
                    // locked client's arousalCopy carries only the universal slots
                    // (eyebrow, insight.label, edu.*, learn.*) — the per-archetype
                    // gate.hook / result / insight.value / mini-stats AND the arc
                    // config (family + acts) are withheld — and `arousalCopy.locked`
                    // mirrors this unlock check. The arc shape is framing (drawn even
                    // locked, under the blur). Only the primary archetype gets a copy
                    // block; browsing another archetype's report renders nothing.
                    // Empty title suppresses ReportSection's header (hidden via CSS on
                    // #arousal_style) — the section renders its own "Arousal Style"
                    // heading per Figma 8427:2191.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <ArousalSection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? arousalCopy : null}
                          config={isPrimaryView ? arousalConfig : null}
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

                  if (section.sectionNumber === 22) {
                    // Report 2.0 "Initiation Style" — a Part III, FULL_REPORT-tier
                    // PREMIUM section (initiation_style; NOT in
                    // ESSENTIALS_SECTION_IDS, so it unlocks only at full_report).
                    // Mounts in Part III right after Arousal (21). Gating is
                    // resolved SERVER-SIDE: a locked client's initiationCopy carries
                    // only the universal framing slots (gate.hook, eyebrow,
                    // row1.label, practical.label, learn.*) — the per-archetype
                    // result / row1.value / takeaway / practical teaser+lines /
                    // body.p1 / mini-stat AND the timeline-chart config (family +
                    // variant) are withheld — and `initiationCopy.locked` mirrors
                    // this unlock check. The two-column sent→received chart is
                    // family framing (drawn even locked, under the blur). Only the
                    // primary archetype gets a copy block; browsing another
                    // archetype's report renders nothing. Empty title suppresses
                    // ReportSection's header (hidden via CSS on #initiation_style) —
                    // the section renders its own "Initiation Style" heading per
                    // Figma 8427:2283.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <InitiationSection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? initiationCopy : null}
                          config={isPrimaryView ? initiationConfig : null}
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

                  if (section.sectionNumber === 28) {
                    // Report 2.0 "Libido Challenges" — a Part IV, FULL_REPORT-tier
                    // PREMIUM section (libido_challenges_in_relationships; NOT in
                    // ESSENTIALS_SECTION_IDS, so it unlocks only at full_report).
                    // Gating is resolved SERVER-SIDE: a locked client's libidoCopy
                    // carries only the universal framing slots (gate.hook, eyebrow,
                    // row1..4.label, practical.label, learn.*) — the per-archetype
                    // result (loop name) / row1..4.value / practical teaser+lines
                    // AND the loop config (name + steps) are withheld — and
                    // `libidoCopy.locked` mirrors this unlock check. The named loop
                    // renders as a cycle of connected chips (only 3 archetypes
                    // carry a loop today; the rest render no chips rather than
                    // fabricating). Only the primary archetype gets a copy block;
                    // browsing another archetype's report renders nothing. Empty
                    // title suppresses ReportSection's header (hidden via CSS on
                    // #libido_challenges_in_relationships) — the section renders its
                    // own "Libido Challenges" heading per Figma 8427:2561.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    const partnershipTier = isSectionIncludedInEssentials(section.id)
                      ? "essentials"
                      : "full_report";
                    return (
                      <Fragment key={section.id}>
                        <ReportSection
                          feedbackWidget={feedbackWidget}
                          primaryArchetype={viewArchetype}
                          sectionId={section.id}
                          title=""
                        >
                          <LibidoSection
                            archetype={viewArchetype}
                            copy={isPrimaryView ? libidoCopy : null}
                            config={isPrimaryView ? libidoConfig : null}
                            offerDeadline={offerDeadline}
                            onUnlock={() => unlockSection(section)}
                            quote={fullReportQuote}
                            sectionTitle={title}
                            tier={partnershipTier}
                          />
                        </ReportSection>
                        {/* "Challenges in Partnership" (Report 2.0, Figma 8427:2619)
                          — no own row in report-general.ts; renders inline right
                          after Libido and shares its full_report gate. Gating is
                          resolved SERVER-SIDE (partnershipCopy.locked); a locked
                          client gets only universal framing. No feedbackWidget:
                          it rides Libido's section shell above. */}
                        <ReportSection
                          primaryArchetype={viewArchetype}
                          sectionId="challenges_in_partnership"
                          title=""
                        >
                          <PartnershipSection
                            archetype={viewArchetype}
                            copy={isPrimaryView ? partnershipCopy : null}
                            loop={isPrimaryView ? partnershipLoop : null}
                            offerDeadline={offerDeadline}
                            onUnlock={() => unlockSection(section)}
                            quote={fullReportQuote}
                            sectionTitle={title}
                            tier={partnershipTier}
                          />
                        </ReportSection>
                      </Fragment>
                    );
                  }

                  if (section.sectionNumber === 29) {
                    // Report 2.0 "Challenges to Enjoy Sex" (Enjoyment) — a Part IV,
                    // FULL_REPORT-tier PREMIUM section
                    // (typical_challenges_to_enjoy_sex_for_the_core_archetype; NOT
                    // in ESSENTIALS_SECTION_IDS, so it unlocks only at full_report).
                    // Mounts right after Libido/Partnership (28), matching the
                    // schema order (enjoy = section 29). The Figma unlocked-report
                    // anchor has no dedicated frame for it, so EnjoymentSection
                    // renders it in the established Arousal pattern (result card +
                    // labelled rows + insight + edu block). This REPLACES the old
                    // long-form `challenges_enjoy` prose that the generic
                    // DimensionSection fallback used to render for this section —
                    // this branch supersedes that path so it isn't double-rendered.
                    // Gating is resolved SERVER-SIDE: a locked client's enjoyCopy
                    // carries only the universal slots (eyebrow, row*.label,
                    // insight.label, edu.*, learn.*) — the per-archetype
                    // gate.hook / result / row*.value / insight.value are withheld —
                    // and `enjoyCopy.locked` mirrors this unlock check. Only the
                    // primary archetype gets a copy block; browsing another
                    // archetype's report renders nothing. Empty title suppresses
                    // ReportSection's header (hidden via CSS on
                    // #typical_challenges_to_enjoy_sex_for_the_core_archetype) — the
                    // section renders its own "Challenges to Enjoy Sex" heading.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <EnjoymentSection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? enjoyCopy : null}
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

                  if (section.sectionNumber === 31) {
                    // Report 2.0 "Growth Potentials" — a Part IV, FULL_REPORT-tier
                    // PREMIUM section (typical_growth_potentials_for_the_core_archetype;
                    // NOT in ESSENTIALS_SECTION_IDS, so it unlocks only at
                    // full_report). Gating is resolved SERVER-SIDE: a locked
                    // client's growthCopy carries only the universal framing slots
                    // (gate.hook, learn.*) — the per-archetype takeaway /
                    // ladder.headline / rung1..5.{from,to,move} / ladder.close are
                    // withheld — and `growthCopy.locked` mirrors this unlock check.
                    // The ladder renders as a vertically stacked stair of rungs,
                    // rendering only rungs whose slots exist (counts vary; never
                    // fabricated). Only the primary archetype gets a copy block;
                    // browsing another archetype's report renders nothing. Empty
                    // title suppresses ReportSection's header (hidden via CSS on
                    // #typical_growth_potentials_for_the_core_archetype) — the
                    // section renders its own "Growth Potentials" heading per Figma
                    // 8427:2678.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <GrowthSection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? growthCopy : null}
                          rungCount={isPrimaryView ? growthRungs : null}
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

                  if (section.sectionNumber === 10) {
                    // Report 2.0 "Confidence Level" — a Part II, essentials-tier
                    // PREMIUM section. UNLIKE the siblings, all copy slots are
                    // universal education; the gated bit is the per-archetype
                    // RESULT (config `confidence_strip` → result word + dot). Gating
                    // is resolved SERVER-SIDE: `confidenceCopy.locked` mirrors this
                    // unlock check and `confidenceStrip` is null when locked (or when
                    // the archetype has no config strip — only Spiritual Lover does
                    // today). Only the primary archetype gets a copy block. Empty
                    // title suppresses ReportSection's header (hidden via CSS on
                    // #confidence_level) — the section renders its own "Confidence
                    // Level" heading per Figma 8427:1563.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <ConfidenceSection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? confidenceCopy : null}
                          strip={isPrimaryView ? confidenceStrip : null}
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

                  if (section.sectionNumber === 11) {
                    // Report 2.0 "Typical Beliefs" — a Part II, essentials-tier
                    // PREMIUM section. Gating is resolved SERVER-SIDE: a locked
                    // client's beliefsCopy carries only the universal educational
                    // slots (the per-archetype keep/loosen/body are withheld), and
                    // `beliefsCopy.locked` mirrors this unlock check. Empty title
                    // suppresses ReportSection's header (hidden via CSS on
                    // #typical_beliefs) — the section renders its own "Typical
                    // Beliefs" heading per Figma 8427:1656.
                    const isBeliefsUnlocked = isSectionUnlockedForPlan({
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
                        title=""
                      >
                        <BeliefsSection
                          archetype={viewArchetype}
                          copy={beliefsCopy}
                          isUnlocked={isBeliefsUnlocked}
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

                  if (section.sectionNumber === 23) {
                    // Report 2.0 "Accelerators & Brakes" — a Part II, essentials-
                    // tier PREMIUM section. Gating is resolved SERVER-SIDE: a
                    // locked client's accelCopy carries only the universal
                    // educational slots (the per-archetype `takeaway` verdict is
                    // withheld), and `accelCopy.locked` mirrors this check. Empty
                    // title suppresses ReportSection's header (hidden via CSS on
                    // #typical_arousal_accelerators_turn_ons_of_the_core_archetype)
                    // — the section renders its own heading per Figma 8946:4286.
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <AcceleratorsSection
                          archetype={viewArchetype}
                          copy={accelCopy}
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
                    // Report 2.0 "Fantasy vs. Reality" — a Part III, FULL_REPORT-tier
                    // PREMIUM section (this section id is NOT in
                    // ESSENTIALS_SECTION_IDS, so it unlocks only at full_report).
                    // Mounts in Part III after Initiation (22). Per the Figma
                    // redesign (node 8427:2462) this one section = the 2-axis fantasy
                    // MAP + universal educational copy (rendered by FantasySection,
                    // which owns the "Fantasy vs. Reality" heading) followed by the
                    // per-user Fantasy-Pull / Actual-Pleasure category tables (the
                    // existing PracticeTendenciesSection, which keeps the REAL scored
                    // data). Every fantasy copy slot is universal, so gating is
                    // resolved SERVER-SIDE only for the map: `fantasyCopy.locked`
                    // blurs the map behind the overlay when the section isn't
                    // unlocked. No per-user fantasy dot data exists yet, so the map
                    // draws the Figma's representative layout for everyone (see
                    // FantasySection). The category tables carry their own
                    // server-side row gating. Empty ReportSection title suppresses
                    // its header (hidden via CSS on this section id) so the heading
                    // isn't duplicated. Only the primary archetype gets a fantasy
                    // copy block; browsing another archetype renders the tables only.
                    const isPrimaryView = viewArchetype === primaryArchetype;
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
                        title=""
                      >
                        <FantasySection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? fantasyCopy : null}
                          dots={isPrimaryView ? fantasyDots : null}
                          offerDeadline={offerDeadline}
                          onUnlock={() => unlockSection(section)}
                          quote={fullReportQuote}
                          sectionTitle={practiceSectionTitle}
                          tables={
                            <PracticeTendenciesSection
                              archetype={viewArchetype}
                              content={practiceTendencies[viewArchetype] ?? null}
                              // The Fantasy card already shows this section's
                              // paywall card over the blurred map, so the tables
                              // must not add a second one — one card per section.
                              hideOverlay={isPrimaryView && fantasyCopy?.locked === true}
                              isPremium={section.isPremium}
                              isUnlocked={isBackendUnlocked}
                              offerDeadline={offerDeadline}
                              onUnlock={() => unlockSection(section)}
                              quote={fullReportQuote}
                              sectionTitle={practiceSectionTitle}
                              tier={
                                isSectionIncludedInEssentials(section.id)
                                  ? "essentials"
                                  : "full_report"
                              }
                            />
                          }
                          tier={
                            isSectionIncludedInEssentials(section.id) ? "essentials" : "full_report"
                          }
                        />
                      </ReportSection>
                    );
                  }

                  if (section.sectionNumber === 32) {
                    // Report 2.0 "Reading Recommendations" — a Part IV,
                    // FULL_REPORT-tier PREMIUM section (recommendations; NOT in
                    // ESSENTIALS_SECTION_IDS, so it unlocks only at full_report).
                    // Gating is resolved SERVER-SIDE: a locked client's readingCopy
                    // carries only the universal framing slots (gate.hook, book*.tag,
                    // closing.lead, learn.*) — the per-archetype book titles /
                    // authors / blurbs and closing.formula are withheld — and
                    // `readingCopy.locked` mirrors this unlock check. Renders only
                    // the books whose title slot exists (counts vary; never
                    // fabricated). Only the primary archetype gets a copy block;
                    // browsing another archetype's report renders nothing. Empty
                    // title suppresses ReportSection's header (hidden via CSS on
                    // #recommendations) — the section renders its own "Reading
                    // Recommendations" heading per Figma 8427:2777.
                    const isPrimaryView = viewArchetype === primaryArchetype;
                    return (
                      <ReportSection
                        key={section.id}
                        feedbackWidget={feedbackWidget}
                        primaryArchetype={viewArchetype}
                        sectionId={section.id}
                        title=""
                      >
                        <ReadingSection
                          archetype={viewArchetype}
                          copy={isPrimaryView ? readingCopy : null}
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
                })();

                return partDivider ? (
                  <Fragment key={section.id}>
                    <ReportPartDivider {...partDivider} />
                    {sectionNode}
                  </Fragment>
                ) : (
                  sectionNode
                );
              })}

              {/* Report 2.0 closing note (Figma 8427:2837) — universal + free,
                  no gating, no CTA. Mounts LAST in the report content, right
                  before the footer. Same for every archetype and every plan. */}
              <ClosingSection />

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
  // The redesigned report starts at the Part I divider — pre-2.0 intros and
  // sections the redesign folded into combined ones are filtered out here, at
  // the single point every consumer (render, nav, scroll-spy) reads from.
  const resolvedSections = resolveReportSections(reportSections, effectiveViewArchetype)
    .filter((section) => !RETIRED_REPORT_SECTION_IDS.has(section.id))
    // Order by the Figma part containers, NOT by `sectionNumber` — the two
    // disagree (Beliefs is numbered after Attachment but comes FIRST in Part II,
    // and Accelerators & Brakes is numbered into Part III but belongs in II).
    // Anything unlisted keeps its numeric order and sorts last.
    .sort((a, b) => {
      const ia = REPORT_SECTION_ORDER.indexOf(a.id);
      const ib = REPORT_SECTION_ORDER.indexOf(b.id);
      if (ia === -1 && ib === -1) return a.sectionNumber - b.sectionNumber;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

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
        snapshotCopy={data.snapshotCopy ?? null}
        findingsCopy={data.findingsCopy ?? null}
        beliefsCopy={data.beliefsCopy ?? null}
        attachmentCopy={data.attachmentCopy ?? null}
        attachmentFamily={data.attachmentFamily ?? null}
        attachmentPlane={data.attachmentPlane ?? null}
        accelCopy={data.accelCopy ?? null}
        insecuritiesCopy={data.insecuritiesCopy ?? null}
        insecurityCueFamily={data.insecurityCueFamily ?? null}
        insecurityGraph={data.insecurityGraph ?? null}
        rewardCopy={data.rewardCopy ?? null}
        rewardConfig={data.rewardConfig ?? null}
        energyCopy={data.energyCopy ?? null}
        energyConfig={data.energyConfig ?? null}
        arousalCopy={data.arousalCopy ?? null}
        arousalConfig={data.arousalConfig ?? null}
        initiationCopy={data.initiationCopy ?? null}
        initiationConfig={data.initiationConfig ?? null}
        libidoCopy={data.libidoCopy ?? null}
        libidoConfig={data.libidoConfig ?? null}
        growthCopy={data.growthCopy ?? null}
        growthRungs={data.growthRungs ?? null}
        readingCopy={data.readingCopy ?? null}
        partnershipCopy={data.partnershipCopy ?? null}
        partnershipLoop={data.partnershipLoop ?? null}
        enjoyCopy={data.enjoyCopy ?? null}
        powerCopy={data.powerCopy ?? null}
        fantasyCopy={data.fantasyCopy ?? null}
        fantasyDots={data.fantasyDots ?? null}
        curiosityCopy={data.curiosityCopy ?? null}
        relationshipFit={data.relationshipFit ?? null}
        lovelangCopy={data.lovelangCopy ?? null}
        loveLanguageOrder={data.loveLanguageOrder ?? null}
        confidenceCopy={data.confidenceCopy ?? null}
        confidenceStrip={data.confidenceStrip ?? null}
        mapCopy={data.mapCopy ?? null}
        stageCopy={data.stageCopy ?? null}
        constellationMottos={data.constellationMottos ?? {}}
        submitFeedback={submitFeedback}
        submitted={submitted}
        theme={theme}
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
