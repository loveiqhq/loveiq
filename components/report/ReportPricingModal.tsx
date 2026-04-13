"use client";

import { useEffect, useRef, type FC, type MutableRefObject } from "react";
import { REPORT_PURCHASE_PLANS, type ReportPurchasePlanId } from "@/lib/checkout/reportPurchase";

interface Props {
  archetype: string;
  open: boolean;
  onClose: () => void;
  onUnlock: (plan: ReportPurchasePlanId) => void;
  returnFocusRef?: MutableRefObject<HTMLElement | null>;
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

const ReportPricingModal: FC<Props> = ({ archetype, open, onClose, onUnlock, returnFocusRef }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const didOpenRef = useRef(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const scrollLockRef = useRef<ScrollLockState | null>(null);

  const subtitle = `Unlock your complete ${archetype} report \u2014 comprehensive coverage of your probabilities, sexual stage, attachment style, desire drivers, and growth paths.`;

  useEffect(() => {
    if (open) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      didOpenRef.current = true;
      closeButtonRef.current?.focus();
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
      if (dialogRef.current?.contains(event.target as Node | null)) return;
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

  return (
    <div
      className={`report-pricing-modal ${open ? "is-visible" : "is-hidden"}`}
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
    >
      <div className="report-pricing-modal__backdrop" aria-hidden="true" onClick={onClose} />

      <div className="report-pricing-modal__viewport" data-lenis-prevent>
        <div
          ref={dialogRef}
          role={open ? "dialog" : undefined}
          aria-modal={open ? "true" : undefined}
          aria-labelledby={open ? "report-pricing-modal-title" : undefined}
          aria-describedby={open ? "report-pricing-modal-copy" : undefined}
          className="report-pricing-modal__dialog"
        >
          <button
            ref={closeButtonRef}
            type="button"
            className="report-pricing-modal__close"
            aria-label="Close pricing modal"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>

          <div className="report-pricing-modal__inner">
            <div className="report-pricing-modal__header">
              <span className="report-pricing-modal__eyebrow">
                Don&apos;t miss out on truly understanding your sexuality
              </span>
              <h2 id="report-pricing-modal-title" className="report-pricing-modal__title">
                Unlock your full report
              </h2>
              <p id="report-pricing-modal-copy" className="report-pricing-modal__copy">
                {subtitle}
              </p>
            </div>

            <div className="report-pricing-modal__plans" role="list" aria-label="Pricing options">
              {REPORT_PURCHASE_PLANS.map((card) => (
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
                  {card.badge || card.featuredLabel ? (
                    <div className="report-pricing-card__badges">
                      {card.badge ? (
                        <span
                          className={[
                            "report-pricing-card__badge",
                            card.badgeTone ? `report-pricing-card__badge--${card.badgeTone}` : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {card.badge}
                        </span>
                      ) : null}
                      {card.featuredLabel ? (
                        <span className="report-pricing-card__badge report-pricing-card__badge--featured">
                          {card.featuredLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="report-pricing-card__heading">
                    <h3 className="report-pricing-card__title">{card.title}</h3>
                    <p className="report-pricing-card__description">{card.description}</p>
                  </div>

                  <div className="report-pricing-card__price">
                    <span
                      className={[
                        "report-pricing-card__strike",
                        !card.strikePrice ? "report-pricing-card__strike--placeholder" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-hidden={card.strikePrice ? undefined : "true"}
                    >
                      {card.strikePrice
                        ? `${card.strikePrice} ${card.priceSuffix === "one-time" ? "one off" : card.priceSuffix}`
                        : "\u00a0"}
                    </span>
                    <div className="report-pricing-card__price-row">
                      <strong>{card.price}</strong>
                      <span>/{card.priceSuffix === "one-time" ? "one off" : card.priceSuffix}</span>
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
                    onClick={() => onUnlock(card.plan)}
                  >
                    {card.ctaLabel}
                  </button>

                  <ul className="report-pricing-card__features">
                    {card.features.map((feature) => (
                      <li
                        key={feature.label}
                        className={[
                          "report-pricing-card__feature",
                          feature.icon === "none" ? "report-pricing-card__feature--subitem" : "",
                          feature.tone === "emphasis"
                            ? "report-pricing-card__feature--emphasis"
                            : "",
                          feature.tone === "muted" ? "report-pricing-card__feature--muted" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {feature.icon !== "none" ? (
                          <span className="report-pricing-card__feature-icon" aria-hidden="true">
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
              ))}
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
              <figcaption className="report-pricing-modal__author">
                <span className="report-pricing-modal__avatar" aria-hidden="true">
                  TV
                </span>
                <span className="report-pricing-modal__author-copy">
                  <span className="report-pricing-modal__author-line">
                    <strong>Dr. Tobias V.</strong>
                    <span className="report-pricing-modal__author-age">40</span>
                  </span>
                  <em>Berlin, Germany</em>
                </span>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportPricingModal;
