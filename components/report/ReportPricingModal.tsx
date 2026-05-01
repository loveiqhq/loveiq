"use client";

import {
  useState,
  useEffect,
  useRef,
  type FC,
  type MutableRefObject,
  type TouchEvent as ReactTouchEvent,
} from "react";
import Image from "next/image";
import {
  REPORT_PURCHASE_PLANS,
  formatReportPurchasePrice,
  getReportPurchaseBadgeFromPrice,
  getReportPurchaseStrikePrice,
  type ReportPurchasePlan,
  type ReportPurchasePlanId,
} from "@/lib/checkout/reportPurchase";
import type { ReportPriceQuoteSnapshot } from "@/lib/pricing/reportPricing";
import { getReportTheme, getReportThemeStyle } from "./reportTheme";

interface Props {
  archetype: string;
  open: boolean;
  onClose: () => void;
  onUnlock: (plan: ReportPurchasePlanId, archetype?: string | null) => void;
  quotes: Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot> | null;
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

const SHOW_TESTIMONIAL = true;

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
    };
  }

  const currentCents = quote.currentPriceCents;
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
  };
}

const ReportPricingModal: FC<Props> = ({
  archetype,
  open,
  onClose,
  onUnlock,
  quotes,
  returnFocusRef,
  targetArchetype = null,
  variant = "default",
}) => {
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

  // "Extra N% OFF" pill on Full card — communicates the ladder depth relative
  // to the starting-sale price (NOT MSRP), so it reads as bonus savings on top
  // of the baseline Full Report discount. Fires from step 2 (72h) onward.
  const fullQuote = quotes?.full_report ?? null;
  const extraDiscountPct =
    fullQuote && fullQuote.startingPriceCents > 0
      ? Math.max(
          0,
          Math.round((1 - fullQuote.currentPriceCents / fullQuote.startingPriceCents) * 100)
        )
      : 0;
  const showExtraDiscountPill =
    isOffer && !!fullQuote && fullQuote.discountStep >= 2 && extraDiscountPct > 0;

  const themeArchetype = targetArchetype ?? archetype;
  const themeStyle = getReportThemeStyle(getReportTheme(themeArchetype));

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
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
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
        window.scrollTo(0, scrollLock.scrollY);
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
      className={`report-pricing-modal ${open ? "is-visible" : "is-hidden"}`}
      data-state={open ? "open" : "closed"}
      data-focus-mode={focusMode}
      data-variant={variant}
      aria-hidden={!open}
      style={themeStyle}
    >
      <div className="report-pricing-modal__backdrop" aria-hidden="true" onClick={onClose} />

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
            onClick={onClose}
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
                  {isShare ? (
                    "Upgrade your plan to share your results"
                  ) : targetArchetype ? (
                    `Unlock the ${targetArchetype} report`
                  ) : isOffer ? (
                    <>
                      <span className="report-pricing-modal__title-accent">
                        Secure your extra discount now,
                      </span>
                      <br />
                      <span className="report-pricing-modal__title-tail">
                        to unlock your full report
                      </span>
                    </>
                  ) : (
                    <>
                      Unlock your full report of{" "}
                      <span className="report-pricing-modal__title-accent">the {archetype}</span>
                    </>
                  )}
                </h2>
                <p id="report-pricing-modal-copy" className="report-pricing-modal__copy">
                  {subtitle}
                </p>
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

                  return (
                    <article
                      key={card.title}
                      role="listitem"
                      className={[
                        "report-pricing-card",
                        card.tone === "highlight"
                          ? "report-pricing-card--hero"
                          : "report-pricing-card--side",
                        card.badge || card.featuredLabel ? "report-pricing-card--with-badge" : "",
                        card.tone === "highlight" ? "report-pricing-card--highlight" : "",
                        card.plan === "essentials" ? "report-pricing-card--essentials" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {(pricing.badge && !isOffer) || card.featuredLabel ? (
                        <div className="report-pricing-card__badges">
                          {pricing.badge && !isOffer ? (
                            <span className="report-pricing-card__badge">{pricing.badge}</span>
                          ) : null}
                          {card.featuredLabel ? (
                            <span className="report-pricing-card__badge report-pricing-card__badge--featured">
                              {card.featuredLabel}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="report-pricing-card__heading">
                        <h3 className="report-pricing-card__title">{cardTitle}</h3>
                        <p className="report-pricing-card__description">{card.description}</p>
                      </div>

                      <div className="report-pricing-card__price">
                        <span
                          className={[
                            "report-pricing-card__strike",
                            !pricing.strikePriceLabel
                              ? "report-pricing-card__strike--placeholder"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          aria-hidden={pricing.strikePriceLabel ? undefined : "true"}
                        >
                          {pricing.strikePriceLabel
                            ? `${pricing.strikePriceLabel} ${card.priceSuffix === "one-time" ? "one off" : card.priceSuffix}`
                            : "\u00a0"}
                        </span>
                        {isOffer && pricing.startingStrikePriceLabel ? (
                          <span className="report-pricing-card__strike report-pricing-card__strike--secondary">
                            {pricing.startingStrikePriceLabel} /
                            {card.priceSuffix === "one-time" ? "one off" : card.priceSuffix}
                          </span>
                        ) : null}
                        <div className="report-pricing-card__price-row">
                          <strong>{pricing.priceLabel}</strong>
                          {pricing.available && !isOffer ? (
                            <span>
                              /{card.priceSuffix === "one-time" ? "one off" : card.priceSuffix}
                            </span>
                          ) : null}
                          {isOffer && pricing.available ? (
                            card.plan === "full_report" && showExtraDiscountPill ? (
                              <span
                                className="report-pricing-card__extra-pill"
                                aria-label={`Extra ${extraDiscountPct} percent off`}
                              >
                                EXTRA {extraDiscountPct}% OFF
                              </span>
                            ) : pricing.badge ? (
                              <span
                                className="report-pricing-card__extra-pill"
                                aria-label={pricing.badge}
                              >
                                {pricing.badge}
                              </span>
                            ) : null
                          ) : null}
                        </div>
                      </div>

                      <button
                        type="button"
                        className={[
                          "report-pricing-card__cta",
                          card.tone === "highlight" ? "report-pricing-card__cta--primary" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={!pricing.available}
                        onClick={() => onUnlock(card.plan, targetArchetype ?? null)}
                      >
                        {pricing.available ? card.ctaLabel : "Pricing unavailable"}
                      </button>

                      <ul className="report-pricing-card__features">
                        {card.features.map((feature) => (
                          <li
                            key={feature.label}
                            className={[
                              "report-pricing-card__feature",
                              feature.icon === "none"
                                ? "report-pricing-card__feature--subitem"
                                : "",
                              feature.tone === "emphasis"
                                ? "report-pricing-card__feature--emphasis"
                                : "",
                              feature.tone === "muted" ? "report-pricing-card__feature--muted" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {feature.icon !== "none" ? (
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

              {SHOW_TESTIMONIAL ? (
                <figure className="report-pricing-modal__testimonial">
                  <div className="report-pricing-modal__stars" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <svg key={index} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="m8 1.5 1.72 3.48 3.84.56-2.78 2.71.66 3.83L8 10.27l-3.44 1.81.66-3.83L2.44 5.54l3.84-.56L8 1.5Z" />
                      </svg>
                    ))}
                  </div>
                  <blockquote className="report-pricing-modal__quote">
                    &ldquo;Unlocking my report was{" "}
                    <em>one of the best investments made for my sexuality.</em> It is shockingly
                    precise&rdquo;
                  </blockquote>
                  <figcaption className="report-pricing-modal__person">
                    <div className="report-pricing-modal__avatar">
                      <Image src="/images/testimonial-richard.png" alt="" width={80} height={80} />
                    </div>
                    <div className="report-pricing-modal__author-copy">
                      <strong>
                        Dr. Tobias V. <span>40</span>
                      </strong>
                      <em>Berlin, Germany</em>
                    </div>
                  </figcaption>
                </figure>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportPricingModal;
