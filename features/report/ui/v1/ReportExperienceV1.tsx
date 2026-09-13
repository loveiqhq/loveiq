"use client";

/**
 * The pre-2.0 report ("V1"), restored from cbba1800 (2026-08-10) — the last
 * commit before `79903323 feat(report): Report 2.0`.
 *
 * Restored on 2026-09-13 because the team asked for the old report back until
 * Report 3.0 lands (WhatsApp, 2026-09-12: Marcus "revert back to the old report
 * until we have report 3.0"; Mark "Revert back fully please"). This is the
 * DEFAULT everyone sees; Report 2.0 stays reachable at `?v2=1` because the
 * in-progress V3 work is built on its section components.
 *
 * Deliberately NOT restored with it: the forced paywall and the EUR 2 urgency
 * countdown. Both were removed on purpose on 2026-08-31 (05725c7f, 565f4cac)
 * and the server no longer sends `forcedPaywallEnabled`, so the old cohort
 * branch could not fire even if it were here. Today's pricing behaviour stands:
 * an opt-in, always-dismissible pricing modal, and unlock straight to Stripe.
 *
 * Two post-2.0 fixes are carried forward rather than reverted:
 *   - `doesAccessPlanCover` gating, so `core` buyers do not get a locked
 *     report (c879c99f).
 *   - copy/right-click/drag blocked on the LIVE site only, so the team can
 *     still quote report copy off staging (c03b8eea).
 */

import { useEffect, useRef, useState, type FC } from "react";
import { useSearchParams } from "next/navigation";
import {
  setReportSubmissionContext,
  trackLockIconClicked,
  trackLockedCardPriceShown,
  trackPaywallInitiated,
  trackReferFriendOpened,
  trackReportChapterMenuOpened,
  trackReportShareOpened,
} from "@features/analytics/client";
import type { ReportPurchasePlanId } from "@features/checkout/server/reportPurchase";
import InviteModal from "@features/invite/ui/InviteModal";
import FooterSection from "@features/landing/ui/FooterSection";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { SUMMARY_BLOCK_ID } from "@features/report/server/contentGating";
import {
  doesAccessPlanCover,
  isSectionIncludedInEssentials,
  isSectionUnlockedForPlan,
  type ReportAccessPlan,
} from "@features/report/server/access";
import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import ReportDesktopSidebar from "./ReportDesktopSidebar";
import ReportMobileNav from "./ReportMobileNav";
import ReportPricingModal from "../ReportPricingModal";
import ReportSection from "../ReportSection";
import SectionFeedback from "../SectionFeedback";
import SharedViewerBanner from "../SharedViewerBanner";
import ShareReportModal from "../ShareReportModal";
import type { ReportPracticeTendencyContentForUser } from "../hooks/useReportData";
import type { FeedbackPayload } from "../hooks/useSectionFeedback";
import { normalizeReportHtml } from "../reportContent";
import { replacePlaceholders, type SnapshotContent } from "../reportPlaceholders";
import { getReportThemeStyle, type ReportTheme } from "../reportTheme";
import type { DisplayReportSection, resolveReportSections } from "../reportTitles";
import ArchetypeProbabilitySection from "../sections/ArchetypeProbabilitySection";
import WelcomeSection from "../sections/WelcomeSection";
import AttachmentPatternsSection from "./sections/AttachmentPatternsSection";
import CoreArchetypeSection from "./sections/CoreArchetypeSection";
import DimensionSection from "./sections/DimensionSection";
import ImportanceOfSexualitySection from "./sections/ImportanceOfSexualitySection";
import PracticeTendenciesSection from "./sections/PracticeTendenciesSection";
import SexualStageSection from "./sections/SexualStageSection";

export interface ReportExperienceV1Props {
  accessPlan: ReportAccessPlan;
  archetypeTiers: Record<string, "essentials" | "full_report">;
  devParam: string | null;
  diagnostics: Record<string, unknown> | null;
  submissionSeed: string | number | null;
  /** Needed so mount-time persisted analytics can be attributed. */
  submissionId: number | null;
  feedbacks: Record<string, "up" | "down" | null>;
  isPricingModalOpen: boolean;
  isShareModalOpen: boolean;
  matchScore: number;
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
  practiceTendencies: Record<string, ReportPracticeTendencyContentForUser>;
  ranking: string[];
  reportDate: string;
  resolvedSections: ReturnType<typeof resolveReportSections>;
  snapshot: SnapshotContent;
  submitFeedback: (sectionId: string, payload: FeedbackPayload) => void;
  submitted: Record<string, boolean>;
  theme: ReportTheme;
  unlockedArchetypes: Set<string>;
  userEmail: string | null;
  userName: string | null;
  viewArchetype: string;
  viewMode: "owner" | "shared";
}

const ReportExperienceV1: FC<ReportExperienceV1Props> = ({
  accessPlan,
  archetypeTiers,
  devParam,
  diagnostics,
  submissionSeed,
  submissionId,
  feedbacks,
  isPricingModalOpen,
  isShareModalOpen,
  matchScore,
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
    !doesAccessPlanCover(accessPlan, "full_report") &&
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
    /**
     * Carried forward from Report 2.0 — do NOT revert this to the pre-2.0 shape.
     *
     * This event reached PostHog 331 times across 276 sessions while writing
     * ZERO rows to `analytics_event` from 2026-08-01 onward, because
     * `persistAnalyticsEvent` drops anything fired before
     * `window.__loveiqReportSubmissionId` is set and the parent published that
     * context in its own effect — which React runs AFTER child effects. The
     * one-shot ref was set before the call, so the dropped attempt was never
     * retried. Publishing the context here removes the ordering dependency
     * (90a15f64), and the price reported is the CHARGED one (a62f2826).
     */
    if (!submissionId) return;
    setReportSubmissionContext(submissionId);
    lockedCardPriceFiredRef.current = true;
    trackLockedCardPriceShown({
      plan: "full_report",
      price: fullReportQuote.chargedPriceCents / 100,
      currency: fullReportQuote.currency,
      bucket: fullReportQuote.basePriceBucket,
      pricing_cluster_id: fullReportQuote.pricingClusterId,
      discount_step: fullReportQuote.discountStep,
      experiment_group: fullReportQuote.experimentGroup,
      msrp: fullReportQuote.msrpCents / 100,
      initial_price: fullReportQuote.initialPriceCents / 100,
    });
  }, [hasLockedPremiumCards, fullReportQuote, submissionId]);
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
  const copyable = isNonProdDeploy();

  return (
    <main
      id="main-content"
      ref={mainContentRef}
      tabIndex={-1}
      className={`report-page${doesAccessPlanCover(accessPlan, "full_report") ? "" : " report-experience--sticky-pad"}${copyable ? " report-page--copyable" : ""}`}
      style={getReportThemeStyle(theme)}
      /**
       * Copy, right-click and drag are blocked on the LIVE site only. The report
       * is the paid product, so lifting its text is the thing this prevents.
       * Off the live site — staging, previews, local dev — they are allowed so the
       * team can review and quote report copy. All four guards move together: the
       * CSS `user-select: none` would make an unblocked `onCopy` useless.
       */
      {...(copyable
        ? {}
        : {
            onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
            onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
            onDragStart: (e: React.DragEvent) => e.preventDefault(),
          })}
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
        aria-hidden={isPricingModalOpen || isShareModalOpen}
        inert={isPricingModalOpen || isShareModalOpen}
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
            isPricingModalOpen || isShareModalOpen ? "report-page__shell-wrap--obscured" : "",
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
                  // Served gated by the API, like every other premium chapter —
                  // NOT imported from `data/report-summary.ts`, which would put
                  // all fourteen archetypes' premium prose in the public bundle.
                  const summaryHtml = normalizeReportHtml(
                    archetypeContent?.[SUMMARY_BLOCK_ID]?.[viewArchetype] ?? null
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

export default ReportExperienceV1;
