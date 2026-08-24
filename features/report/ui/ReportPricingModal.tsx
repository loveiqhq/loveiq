"use client";

import {
  useState,
  useEffect,
  useRef,
  type CSSProperties,
  type FC,
  type MutableRefObject,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  REPORT_PURCHASE_PLANS,
  formatReportPurchasePrice,
  getReportPurchaseBadgeFromPrice,
  getReportPurchaseStrikePrice,
  type ReportPurchasePlan,
  type ReportPurchasePlanId,
} from "@features/checkout/server/reportPurchase";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import TrustpilotReviews from "@shared/ui/trustpilot/TrustpilotReviews";
import PaywallTestimonials from "./PaywallTestimonials";
import { usePaywallCountdownValue, PaywallCountdownDigits } from "./PaywallCountdown";
import { REPORT_PAYWALL_COUNTDOWN_MS } from "@features/survey/ui/hooks/surveySession";
import { isTrustpilotEnabled } from "@shared/ui/trustpilot/config";
import { isPlanOwnedForArchetype, type ReportAccessPlan } from "@features/report/server/access";
import {
  trackBeginCheckout,
  trackPaywallDismissed,
  trackPriceShown,
  type PaywallDismissSource,
} from "@features/analytics/client";
import { restoreScroll } from "@shared/ui/restore-scroll";

interface Props {
  accessPlan?: ReportAccessPlan;
  archetype: string;
  /** Per-archetype tier the user already owns (essentials | full_report). */
  archetypeTiers?: Record<string, "essentials" | "full_report">;
  open: boolean;
  onClose: () => void;
  onUnlock: (plan: ReportPurchasePlanId, archetype?: string | null) => void;
  /**
   * The user's primary archetype. Used to resolve the right tier when the
   * modal is opened without `targetArchetype` (i.e. scoped to primary).
   */
  primaryArchetype?: string | null;
  quotes: Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot> | null;
  /** Shared epoch-ms countdown deadline (resolved once per report session). */
  offerDeadline?: number;
  returnFocusRef?: MutableRefObject<HTMLElement | null>;
  targetArchetype?: string | null;
  /**
   * "default" — original behaviour.
   * "offer" — discount email deep-link (?offer=1): orange-accent headline +
   *   "Extra N% OFF" pill on the Full card when ladder has progressed past 50%.
   * "share" — opened when a free-plan user taps the share button: header copy
   *   pivots to the sharing pitch (Figma node 6389-106).
   */
  variant?: "default" | "offer" | "share";
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Orange→purple gradient used for the italic emphasis in the "Why unlock
// Reports?" cards (matches ScrollPricingModal + Figma 8442-16168).
const gradientTextStyle: CSSProperties = {
  background: "linear-gradient(90deg, #fe6839 0%, #a855f7 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
};

// "Why unlock Reports?" 2×2 cards (Figma 8442-16168). Card 04 is price-prefixed
// at render (filled from the cheapest live quote).
const WHY_CARDS = [
  {
    num: "01",
    tag: "Risk free",
    lead: "14-day money-back guarantee.",
    emph: "Zero risk.",
    body: "Read the full report. If it doesn’t land, every cent back, no questions.",
    priceLed: false,
  },
  {
    num: "02",
    tag: "Deep clarity",
    lead: "Understand one of life’s most important areas:",
    emph: "sexuality, desire, love, and intimacy.",
    body: "Most of us were never taught any of this. Your report finally puts language to it.",
    priceLed: false,
  },
  {
    num: "03",
    tag: "Break patterns",
    lead: "Stop repeating old patterns",
    emph: "and finally understand what drives them.",
    body: "The same dynamics show up across relationships for a reason. See yours, named.",
    priceLed: false,
  },
  {
    num: "04",
    tag: "Lifetime value",
    lead: "For the price of a cocktail or a movie ticket,",
    emph: "get insights that change how you connect and desire.",
    body: "one time. Yours forever — re-read it, share it, return to it.",
    priceLed: true,
  },
] as const;

interface ScrollLockState {
  htmlOverflow: string;
  bodyLeft: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyRight: string;
  bodyTop: string;
  bodyWidth: string;
  scrollY: number;
}

function PricingMethodMark({
  logo,
  label,
}: {
  label: string;
  logo: "apple-pay" | "paypal" | "google-pay" | "klarna" | "mastercard" | "visa" | "amex";
}) {
  return (
    <span
      className="report-pricing-modal__payment-method report-pricing-modal__payment-method--logo"
      role="img"
      aria-label={label}
    >
      <span
        className={`report-pricing-modal__payment-logo report-pricing-modal__payment-logo--${logo}`}
        aria-hidden="true"
      />
    </span>
  );
}

// Whole euros without a ".00" tail (Figma renders "Save €5"); fractional amounts
// keep 2 decimals ("Save €4.50").
function formatSaveAmount(cents: number): string {
  const euros = cents / 100;
  return `€${Number.isInteger(euros) ? euros.toFixed(0) : euros.toFixed(2)}`;
}

function getCardPricing(
  _card: ReportPurchasePlan,
  quote: ReportPriceQuoteSnapshot | null | undefined
) {
  if (!quote) {
    return {
      available: false,
      badge: null,
      priceLabel: "Pricing unavailable",
      strikePriceLabel: null,
      startingStrikePriceLabel: null,
      saveLabel: null,
    };
  }

  // The charged price, i.e. base + urgency surcharge once this reader's countdown has
  // run out. `strikeEligible` and the badge below both compare against it, so a bucket
  // whose MSRP the surcharge overtakes simply loses its anchor instead of advertising a
  // cheaper past.
  const currentCents = quote.chargedPriceCents;
  const strikeCents = quote.msrpCents;
  const startingCents = quote.startingPriceCents;
  // Hide strike when the MSRP and current price are equal (e.g. legacy
  // pre-migration rows where `msrpCents` backfilled to the same value) so the
  // modal doesn't render a pointless line-through over an identical number.
  const strikeEligible = typeof strikeCents === "number" && strikeCents > currentCents;
  // Secondary strike = the regular sale price (between MSRP and current). Only
  // shown in offer mode when the discount ladder has dropped current below
  // starting AND starting is itself below MSRP.
  const startingEligible =
    typeof startingCents === "number" &&
    startingCents > currentCents &&
    (!strikeEligible || (typeof strikeCents === "number" && startingCents < strikeCents));
  return {
    available: true,
    badge: getReportPurchaseBadgeFromPrice({ strikeCents, currentCents }),
    priceLabel: formatReportPurchasePrice(currentCents),
    strikePriceLabel: strikeEligible ? getReportPurchaseStrikePrice(strikeCents) : null,
    startingStrikePriceLabel: startingEligible ? getReportPurchaseStrikePrice(startingCents) : null,
    // Inline "Save €X" pill (Figma 8442-16168) — the euro amount off the strike,
    // whole euros shown without ".00" (Figma renders "Save €5", not "Save €5.00").
    saveLabel:
      strikeEligible && typeof strikeCents === "number"
        ? formatSaveAmount(strikeCents - currentCents)
        : null,
  };
}

const ReportPricingModal: FC<Props> = ({
  accessPlan = null,
  archetype,
  archetypeTiers,
  open,
  onClose,
  onUnlock,
  primaryArchetype = null,
  quotes,
  offerDeadline,
  returnFocusRef,
  targetArchetype = null,
  variant = "default",
}) => {
  // The modal can be scoped to a specific archetype (`targetArchetype`, set
  // when the user clicks a row in "Probability of Other Archetypes") or to
  // the primary archetype. In either case, ownership is resolved per-archetype
  // via the per-archetype tier map.
  const scopeArchetype = targetArchetype ?? primaryArchetype ?? archetype;
  const unlockedTier = (scopeArchetype && archetypeTiers?.[scopeArchetype]) || null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const didOpenRef = useRef(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const scrollLockRef = useRef<ScrollLockState | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const [focusMode, setFocusMode] = useState<"keyboard" | "pointer">("pointer");

  const isOffer = variant === "offer";
  const isShare = variant === "share";
  const subtitle = isShare
    ? "Your current plan does not include report sharing. Upgrade to learn more about yourself, share your insights, and spark honest, meaningful conversations."
    : targetArchetype
      ? `Unlock the complete ${targetArchetype} report \u2014 full attachment, desire drivers, practices, and growth paths for this archetype.`
      : isOffer
        ? "Unlock your complete archetype report \u2014 comprehensive coverage of your archetype probabilities, sexual stage, attachment style, desire drivers, and growth paths."
        : `Unlock your complete ${archetype} report \u2014 attachment style, core insecurities, confidence, love language, arousal, desire drivers, fantasies, and more.`;
  const planCards = REPORT_PURCHASE_PLANS;

  // Urgency countdown (Figma 8442-16168). Reads the SHARED provider value, like
  // the locked-section cards and the sticky pill, rather than running a second
  // interval of its own — two intervals drifted up to a second apart, so the
  // modal's tiles and the card behind it could show 02:57 and 02:58. Falls back to
  // a local ticker only when there is no provider (isolated unit tests).
  const [fallbackDeadline] = useState(() =>
    typeof window === "undefined" ? 0 : Date.now() + REPORT_PAYWALL_COUNTDOWN_MS
  );
  const { mm, ss } = usePaywallCountdownValue(offerDeadline ?? fallbackDeadline);
  // Cheapest live price — prefixes the "Lifetime value" why-card ("<price>, one
  // time…"). Read from the quote, never a literal, so it follows the catalogue.
  const cheapestPriceLabel = quotes?.full_report
    ? formatReportPurchasePrice(quotes.full_report.chargedPriceCents)
    : null;

  // "Extra N% OFF" pill on Full card — communicates the ladder depth relative
  // to the starting-sale price (NOT MSRP), so it reads as bonus savings on top
  // of the baseline Full Report discount. Fires from step 2 (72h) onward.
  const fullQuote = quotes?.full_report ?? null;
  const extraDiscountPct =
    fullQuote && fullQuote.startingPriceCents > 0
      ? Math.max(
          0,
          Math.round((1 - fullQuote.chargedPriceCents / fullQuote.startingPriceCents) * 100)
        )
      : 0;
  const showExtraDiscountPill =
    isOffer && !!fullQuote && fullQuote.discountStep >= 2 && extraDiscountPct > 0;

  // Dismiss tracking — openedAtRef captures when the modal became visible;
  // dismissReasonRef is set by the 3 dismiss code paths (escape / backdrop /
  // close button) so we can attribute the dismiss to the user's actual
  // interaction. checkoutInitiatedRef short-circuits the dismiss event when
  // the user clicked an Unlock CTA — we don't want to double-count
  // conversions as dismissals.
  //
  // We do NOT fire paywall_view here. Founder's call (2026-05-24): auto-mount
  // surfaces are "forced" exposure; only user-initiated clicks (lock_click,
  // archetype_unlock, offer_link) should count toward intent. Those fire
  // trackPaywallInitiated from ReportPage at the click handler.
  const openedAtRef = useRef(0);
  const dismissReasonRef = useRef<PaywallDismissSource | null>(null);
  const checkoutInitiatedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      if (openedAtRef.current > 0) {
        if (!checkoutInitiatedRef.current) {
          trackPaywallDismissed({
            source: dismissReasonRef.current ?? "browser_back",
            view_duration_ms: performance.now() - openedAtRef.current,
            archetype: scopeArchetype ?? null,
          });
        }
        openedAtRef.current = 0;
        dismissReasonRef.current = null;
        checkoutInitiatedRef.current = false;
      }
      return;
    }
    // First-open: stamp the open timestamp. Re-renders while already open are
    // no-ops because openedAtRef stays non-zero until the next close.
    if (openedAtRef.current === 0) {
      openedAtRef.current = performance.now();
    }
    // scopeArchetype changes infrequently and would otherwise re-trigger this
    // effect on every prop change; reading via a ref keeps deps minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Per-plan `price_shown` emit. Deduped by (plan, pricingClusterId, discountStep)
  // so re-opening the modal or the ladder advancing emits a new event without
  // double-counting a stable render. Powers the "Price Shown" funnel column +
  // per-cluster CVR analysis.
  const priceShownFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    if (!quotes) return;
    for (const card of REPORT_PURCHASE_PLANS) {
      const quote = quotes[card.plan];
      if (!quote) continue;
      const dedupeKey = `${card.plan}:${quote.pricingClusterId}:${quote.discountStep}`;
      if (priceShownFiredRef.current.has(dedupeKey)) continue;
      priceShownFiredRef.current.add(dedupeKey);
      trackPriceShown({
        plan: card.plan,
        price: quote.chargedPriceCents / 100,
        surcharge: quote.surchargeCents / 100,
        currency: quote.currency,
        bucket: quote.basePriceBucket,
        pricing_cluster_id: quote.pricingClusterId,
        discount_step: quote.discountStep,
        experiment_group: quote.experimentGroup,
        msrp: quote.msrpCents / 100,
        initial_price: quote.initialPriceCents / 100,
      });
    }
  }, [open, quotes]);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      didOpenRef.current = true;
      requestAnimationFrame(() => {
        dialogRef.current?.focus({ preventScroll: true });
      });
      return;
    }

    if (didOpenRef.current) {
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget && restoreTarget.isConnected) {
        restoreTarget.focus();
      } else {
        returnFocusRef?.current?.focus();
      }
      didOpenRef.current = false;
    }
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    scrollLockRef.current = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyLeft: document.body.style.left,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyRight: document.body.style.right,
      bodyTop: document.body.style.top,
      bodyWidth: document.body.style.width,
      scrollY,
    };

    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        setFocusMode("keyboard");
      }

      if (event.key === "Escape") {
        event.preventDefault();
        dismissReasonRef.current = "escape";
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;

      // focusables.length checked > 0 above; first/last are defined.
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (scrollRegionRef.current?.contains(event.target as Node | null)) return;
      event.preventDefault();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      const scrollLock = scrollLockRef.current;
      document.documentElement.style.overflow = scrollLock?.htmlOverflow ?? "";
      document.body.style.left = scrollLock?.bodyLeft ?? "";
      document.body.style.overflow = scrollLock?.bodyOverflow ?? "";
      document.body.style.position = scrollLock?.bodyPosition ?? "";
      document.body.style.right = scrollLock?.bodyRight ?? "";
      document.body.style.top = scrollLock?.bodyTop ?? "";
      document.body.style.width = scrollLock?.bodyWidth ?? "";
      if (scrollLock) {
        restoreScroll(scrollLock.scrollY);
      }
      scrollLockRef.current = null;
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [onClose, open]);

  const handleScrollTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleScrollTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const scrollRegion = scrollRegionRef.current;
    const touchStartY = touchStartYRef.current;
    const currentY = event.touches[0]?.clientY;

    if (!scrollRegion || touchStartY === null || currentY === undefined) return;

    const deltaY = currentY - touchStartY;
    const noOverflow = scrollRegion.scrollHeight <= scrollRegion.clientHeight + 1;
    const atTop = scrollRegion.scrollTop <= 0;
    const atBottom =
      scrollRegion.scrollTop + scrollRegion.clientHeight >= scrollRegion.scrollHeight - 1;

    if (noOverflow || (atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
      event.preventDefault();
    }
  };

  const resetScrollTouchTracking = () => {
    touchStartYRef.current = null;
  };

  return (
    <div
      className={`report-pricing-modal report-pricing-modal--white ${open ? "is-visible" : "is-hidden"}`}
      data-state={open ? "open" : "closed"}
      data-focus-mode={focusMode}
      data-variant={variant}
      aria-hidden={!open}
    >
      <div
        className="report-pricing-modal__backdrop"
        aria-hidden="true"
        onClick={() => {
          dismissReasonRef.current = "backdrop";
          onClose();
        }}
      />

      <div className="report-pricing-modal__viewport">
        <div
          ref={dialogRef}
          role={open ? "dialog" : undefined}
          aria-modal={open ? "true" : undefined}
          aria-labelledby={open ? "report-pricing-modal-title" : undefined}
          aria-describedby={open ? "report-pricing-modal-copy" : undefined}
          className="report-pricing-modal__dialog"
          tabIndex={-1}
          onPointerDown={() => setFocusMode("pointer")}
        >
          <button
            type="button"
            className="report-pricing-modal__close"
            aria-label="Close pricing modal"
            onClick={() => {
              dismissReasonRef.current = "close_button";
              onClose();
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>

          <div
            ref={scrollRegionRef}
            className="report-pricing-modal__scroll-region"
            data-lenis-prevent
            onTouchCancel={resetScrollTouchTracking}
            onTouchEnd={resetScrollTouchTracking}
            onTouchMove={handleScrollTouchMove}
            onTouchStart={handleScrollTouchStart}
          >
            <div className="report-pricing-modal__inner">
              <div className="report-pricing-modal__header">
                <span className="report-pricing-modal__eyebrow">
                  {isShare
                    ? "Ready to share your report insights?"
                    : "Don\u2019t miss out on truly understanding your sexuality"}
                </span>
                <h2 id="report-pricing-modal-title" className="report-pricing-modal__title">
                  {isShare ? "Upgrade your plan to share your results" : "Unlock your reports."}
                </h2>
                <p id="report-pricing-modal-copy" className="report-pricing-modal__copy">
                  {isShare
                    ? subtitle
                    : "Go deeper into the full picture of who you are, and how you fit with someone else."}
                </p>
                {!isShare ? (
                  <div className="report-pricing-modal__stats" aria-hidden="true">
                    <span className="report-pricing-modal__stat">
                      <strong>59</strong> questions answered
                    </span>
                    <span className="report-pricing-modal__stat-dot" />
                    <span className="report-pricing-modal__stat">
                      <strong>14</strong> archetypes
                    </span>
                    <span className="report-pricing-modal__stat-dot" />
                    <span className="report-pricing-modal__stat">
                      <strong>30+</strong> personalised chapters
                    </span>
                  </div>
                ) : null}
                {!quotes ? (
                  <p className="report-pricing-modal__copy" role="alert">
                    Live pricing couldn&apos;t be loaded right now. Reload the page and try again.
                  </p>
                ) : null}
              </div>

              <div className="report-pricing-modal__plans" role="list" aria-label="Pricing options">
                {planCards.map((card) => {
                  const pricing = getCardPricing(card, quotes?.[card.plan]);
                  const cardTitle =
                    targetArchetype && card.plan === "full_report"
                      ? `${targetArchetype} report`
                      : card.title;
                  const isOwned = isPlanOwnedForArchetype({
                    accessPlan,
                    targetPlan: card.plan,
                    unlockedTier,
                  });

                  return (
                    <article
                      key={card.title}
                      role="listitem"
                      className={[
                        "report-pricing-card",
                        `report-pricing-card--${card.plan}`,
                        card.tone === "highlight"
                          ? "report-pricing-card--hero"
                          : "report-pricing-card--side",
                        card.badge || card.featuredLabel ? "report-pricing-card--with-badge" : "",
                        card.tone === "highlight" ? "report-pricing-card--highlight" : "",
                        card.plan === "essentials" ? "report-pricing-card--essentials" : "",
                        isOwned ? "report-pricing-card--owned" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {card.featuredLabel || card.badge ? (
                        <div className="report-pricing-card__badges">
                          <span
                            className={[
                              "report-pricing-card__badge",
                              card.featuredLabel
                                ? "report-pricing-card__badge--featured"
                                : "report-pricing-card__badge--outline",
                            ].join(" ")}
                          >
                            {card.featuredLabel ?? card.badge}
                          </span>
                        </div>
                      ) : null}

                      <div className="report-pricing-card__heading">
                        <h3 className="report-pricing-card__title">{cardTitle}</h3>
                        <p className="report-pricing-card__description">{card.description}</p>
                      </div>

                      <div className="report-pricing-card__price-row">
                        {pricing.strikePriceLabel ? (
                          <span className="report-pricing-card__strike">
                            {pricing.strikePriceLabel}
                          </span>
                        ) : null}
                        <span className="report-pricing-card__amount">{pricing.priceLabel}</span>
                        {pricing.available ? (
                          <span className="report-pricing-card__suffix">
                            {card.priceSuffix === "one-time" ? "one-off" : card.priceSuffix}
                          </span>
                        ) : null}
                        <span className="report-pricing-card__price-flex" aria-hidden="true" />
                        {pricing.saveLabel ? (
                          <span className="report-pricing-card__save">
                            Save {pricing.saveLabel}
                          </span>
                        ) : null}
                      </div>

                      {card.subtitle ? (
                        <p className="report-pricing-card__subtitle">{card.subtitle}</p>
                      ) : null}

                      <button
                        type="button"
                        className={[
                          "report-pricing-card__cta",
                          // Every LIVE unlock CTA is the branded orange button and
                          // stacks the shared .rpm-cta wash-reveal (orange → white
                          // with dark text on hover, same as the sticky "Unlock full
                          // report" CTA). The highlight tier is set apart by its card
                          // border + "Most popular" badge, not a unique button colour.
                          // A disabled (owned / pricing-unavailable) button skips the
                          // orange + animation so it doesn't read as clickable.
                          !isOwned && pricing.available
                            ? "report-pricing-card__cta--primary rpm-cta"
                            : "",
                          isOwned ? "report-pricing-card__cta--owned" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={isOwned || !pricing.available}
                        aria-disabled={isOwned || !pricing.available}
                        onClick={
                          isOwned
                            ? undefined
                            : () => {
                                // Mark conversion intent so the open→close
                                // effect doesn't double-count this as a
                                // dismissal.
                                checkoutInitiatedRef.current = true;
                                const quote = quotes?.[card.plan];
                                if (quote) {
                                  trackBeginCheckout(
                                    card.plan,
                                    quote.chargedPriceCents / 100,
                                    quote.currency
                                  );
                                }
                                onUnlock(
                                  card.plan,
                                  // Essentials + Full Report are per-archetype; if the modal
                                  // wasn't opened scoped to a specific tile, the buyer is
                                  // upgrading their primary archetype. all_reports is global
                                  // and the parent strips archetype anyway.
                                  card.plan === "all_reports"
                                    ? null
                                    : (targetArchetype ?? primaryArchetype ?? archetype)
                                );
                              }
                        }
                      >
                        {isOwned ? (
                          "Your current plan"
                        ) : !pricing.available ? (
                          "Pricing unavailable"
                        ) : (
                          <>
                            <span className="rpm-cta__wash" aria-hidden="true" />
                            <span className="rpm-cta__reveal" aria-hidden="true" />
                            <span className="rpm-cta__label">{card.ctaLabel}</span>
                          </>
                        )}
                      </button>

                      <p className="report-pricing-card__guarantee">
                        <span className="report-pricing-card__guarantee-icon" aria-hidden="true">
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          >
                            <path
                              d="M8 1.5 2.9 3.5v3.8c0 3.1 2.2 5.1 5.1 6.1 2.9-1 5.1-3 5.1-6.1V3.5L8 1.5Z"
                              strokeLinejoin="round"
                            />
                            <path
                              d="m5.9 7.9 1.5 1.5 2.9-3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        14-day money-back guarantee
                      </p>

                      <ul className="report-pricing-card__features">
                        {card.features.map((feature) => (
                          <li
                            key={feature.label}
                            className={[
                              "report-pricing-card__feature",
                              feature.icon === "none"
                                ? "report-pricing-card__feature--subitem"
                                : "",
                              feature.icon === "lock" ? "report-pricing-card__feature--locked" : "",
                              feature.tone === "emphasis"
                                ? "report-pricing-card__feature--emphasis"
                                : "",
                              feature.tone === "muted" ? "report-pricing-card__feature--muted" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {feature.icon === "lock" ? (
                              <span
                                className="report-pricing-card__feature-icon report-pricing-card__feature-icon--locked"
                                aria-hidden="true"
                              >
                                <svg
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                >
                                  <rect x="3.6" y="7" width="8.8" height="6.4" rx="1.3" />
                                  <path d="M5.5 7V5.1a2.5 2.5 0 0 1 5 0V7" strokeLinecap="round" />
                                </svg>
                              </span>
                            ) : feature.icon !== "none" ? (
                              <span
                                className="report-pricing-card__feature-icon"
                                aria-hidden="true"
                              >
                                <svg
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                >
                                  <path d="m4.1 8 2.2 2.25L11.9 4.9" strokeLinecap="round" />
                                </svg>
                              </span>
                            ) : null}
                            <span>{feature.label}</span>
                          </li>
                        ))}
                      </ul>

                      {card.footnote ? (
                        <p className="report-pricing-card__footnote">
                          {(() => {
                            const q = card.footnote.indexOf("? ");
                            return q === -1 ? (
                              card.footnote
                            ) : (
                              <>
                                <strong className="report-pricing-card__footnote-lead">
                                  {card.footnote.slice(0, q + 1)}
                                </strong>
                                {card.footnote.slice(q + 1)}
                              </>
                            );
                          })()}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <div className="report-pricing-modal__payments" aria-label="Accepted payment methods">
                <PricingMethodMark logo="apple-pay" label="Apple Pay" />
                <PricingMethodMark logo="paypal" label="PayPal" />
                <PricingMethodMark logo="google-pay" label="Google Pay" />
                <PricingMethodMark logo="klarna" label="Klarna" />
                <PricingMethodMark logo="mastercard" label="Mastercard" />
                <PricingMethodMark logo="visa" label="Visa" />
                <PricingMethodMark logo="amex" label="American Express" />
              </div>

              <div
                className="report-pricing-modal__countdown"
                role="timer"
                aria-label={`Offer expires in ${mm}:${ss}`}
              >
                <span className="report-pricing-modal__countdown-label">
                  Time left to secure this offer
                </span>
                <PaywallCountdownDigits mm={mm} ss={ss} />
              </div>

              <PaywallTestimonials open={open} />

              <section className="rpm-why report-pricing-modal__why">
                <h3 className="rpm-section-h">
                  Why unlock <em style={gradientTextStyle}>Reports</em>?
                </h3>
                <div className="rpm-why-grid rpm-why-grid--static">
                  {WHY_CARDS.map(({ num, tag, lead, emph, body, priceLed }) => (
                    <article key={num} className="rpm-why-card">
                      <div className="rpm-why-card__head">
                        <span className="rpm-why-card__num">{num}</span>
                        <span className="rpm-why-card__tag">{tag}</span>
                      </div>
                      <div className="rpm-why-card__body">
                        <h4 className="rpm-why-card__title">
                          {lead} <em style={gradientTextStyle}>{emph}</em>
                        </h4>
                        <p className="rpm-why-card__text">
                          {priceLed && cheapestPriceLabel ? `${cheapestPriceLabel}, ${body}` : body}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {isTrustpilotEnabled() && <TrustpilotReviews variant="carousel" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportPricingModal;
