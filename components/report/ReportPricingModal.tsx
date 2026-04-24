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

interface Props {
  archetype: string;
  open: boolean;
  onClose: () => void;
  onUnlock: (plan: ReportPurchasePlanId, archetype?: string | null) => void;
  quotes: Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot> | null;
  returnFocusRef?: MutableRefObject<HTMLElement | null>;
  targetArchetype?: string | null;
  /**
   * "default" (current behaviour) vs "offer" — triggered from the discount email
   * deep-link (?offer=1). Swaps the headline, recolours the first clause to
   * orange, and surfaces the "Extra N% OFF" inline pill on the Full card when
   * the ladder has progressed past 50%.
   */
  variant?: "default" | "offer";
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
  card: ReportPurchasePlan,
  quote: ReportPriceQuoteSnapshot | null | undefined
) {
  if (!quote) {
    return {
      available: false,
      badge: null,
      priceLabel: "Pricing unavailable",
      strikePriceLabel: null,
    };
  }

  const priceCents = quote.currentPriceCents;
  // Only show the strike line when the plan is genuinely discounted — else
  // e.g. Essentials (strike 1499 === current 1499 at 0-discount) would render
  // a line-through over the same number as the active price.
  const strikeEligible =
    typeof card.strikePriceCents === "number" && card.strikePriceCents > priceCents;
  return {
    available: true,
    badge: getReportPurchaseBadgeFromPrice({ plan: card, priceCents }),
    priceLabel: formatReportPurchasePrice(priceCents),
    strikePriceLabel: strikeEligible ? getReportPurchaseStrikePrice(card) : null,
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
  const subtitle = targetArchetype
    ? `Unlock the complete ${targetArchetype} report \u2014 full attachment, desire drivers, practices, and growth paths for this archetype.`
    : isOffer
      ? "Unlock your complete archetype report \u2014 comprehensive coverage of your archetype probabilities, sexual stage, attachment style, desire drivers, and growth paths."
      : `Unlock your complete ${archetype} report \u2014 attachment style, core insecurities, confidence, love language, arousal, desire drivers, fantasies, and more.`;
  const planCards = targetArchetype
    ? REPORT_PURCHASE_PLANS.filter((card) => card.plan === "full_report")
    : REPORT_PURCHASE_PLANS;

  // "Extra 50% OFF" inline pill on Full card fires once the ladder hits 50% or
  // deeper. Matches the "Extra 50% OFF" badge from Figma 5495:302.
  const fullQuote = quotes?.full_report ?? null;
  const showExtraDiscountPill =
    isOffer && !!fullQuote && fullQuote.discountMultiplier <= 0.5 && fullQuote.discountStep >= 2;
  const extraDiscountPct = fullQuote
    ? Math.max(0, Math.round((1 - fullQuote.discountMultiplier) * 100))
    : 0;

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
                  Don&apos;t miss out on truly understanding your sexuality
                </span>
                <h2 id="report-pricing-modal-title" className="report-pricing-modal__title">
                  {targetArchetype ? (
                    `Unlock the ${targetArchetype} report`
                  ) : isOffer ? (
                    <>
                      <span className="report-pricing-modal__title-accent">
                        Secure your extra discount now,
                      </span>{" "}
                      to unlock your full report
                    </>
                  ) : (
                    "Unlock your full report"
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
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {pricing.badge || card.featuredLabel ? (
                        <div className="report-pricing-card__badges">
                          {pricing.badge ? (
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
                            ? `${pricing.strikePriceLabel} ${card.priceSuffix === "one-time" ? "one time off" : card.priceSuffix}`
                            : "\u00a0"}
                        </span>
                        <div className="report-pricing-card__price-row">
                          <strong>{pricing.priceLabel}</strong>
                          {pricing.available ? (
                            <span>
                              /{card.priceSuffix === "one-time" ? "one time off" : card.priceSuffix}
                            </span>
                          ) : null}
                          {card.plan === "full_report" && showExtraDiscountPill ? (
                            <span
                              className="report-pricing-card__extra-pill"
                              aria-label={`Extra ${extraDiscountPct} percent off`}
                            >
                              Extra {extraDiscountPct}% OFF
                            </span>
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

              <figure className="report-pricing-modal__testimonial">
                <div className="report-pricing-modal__person">
                  <div className="report-pricing-modal__avatar">
                    <Image
                      src="/images/testimonial-richard.png"
                      alt="Richard"
                      width={82}
                      height={82}
                    />
                  </div>
                  <div className="report-pricing-modal__author-copy">
                    <strong>Richard, 34</strong>
                    <em>Manager / Spark seeker</em>
                  </div>
                </div>
                <div className="report-pricing-modal__stars" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <svg key={index} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="m8 1.5 1.72 3.48 3.84.56-2.78 2.71.66 3.83L8 10.27l-3.44 1.81.66-3.83L2.44 5.54l3.84-.56L8 1.5Z" />
                    </svg>
                  ))}
                </div>
                <blockquote className="report-pricing-modal__quote">
                  {isOffer ? (
                    <>
                      &ldquo;Unlocking my report was{" "}
                      <em>one of the best investments made for my sexuality.</em> It is shockingly
                      precise&rdquo;
                    </>
                  ) : (
                    <>
                      &ldquo;The results were <em>more insightful than I expected</em>. It connected
                      dots between emotional triggers and communication styles I hadn&rsquo;t
                      noticed before. Solid UX, too.&rdquo;
                    </>
                  )}
                </blockquote>
              </figure>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportPricingModal;
