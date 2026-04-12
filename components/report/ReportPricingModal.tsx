"use client";

import { useEffect, useRef, type FC, type MutableRefObject, type ReactNode } from "react";

type UnlockPlan = "essentials" | "full_report" | "all_reports";

interface Props {
  archetype: string;
  open: boolean;
  onClose: () => void;
  onUnlock: (plan: UnlockPlan) => void;
  returnFocusRef?: MutableRefObject<HTMLElement | null>;
}

interface PricingCard {
  badge?: string;
  badgeTone?: "discount" | "accent";
  ctaLabel: string;
  description: string;
  featuredLabel?: string;
  features: PricingFeature[];
  plan: UnlockPlan;
  price: string;
  priceSuffix: string;
  strikePrice?: string;
  title: string;
  tone?: "highlight";
}

interface PricingFeature {
  icon?: "check" | "none";
  label: string;
  tone?: "default" | "emphasis" | "muted";
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const pricingCards: PricingCard[] = [
  {
    ctaLabel: "Unlock Essentials",
    description: "Built for those with limited time",
    features: [
      {
        label: "Includes the following chapter:",
      },
      {
        icon: "none",
        label: "Basic Archetype Info",
        tone: "muted",
      },
      {
        icon: "none",
        label: "Core Desire Drivers",
        tone: "muted",
      },
      {
        icon: "none",
        label: "Initial Growth Paths",
        tone: "muted",
      },
      {
        label: "Share report with 1 extra email",
      },
    ],
    plan: "essentials",
    price: "\u20AC14.99",
    priceSuffix: "/one off",
    title: "Essentials only",
  },
  {
    badge: "50% OFF",
    badgeTone: "discount",
    ctaLabel: "Unlock full report",
    description: "Perfect for individuals who want to dive deep",
    featuredLabel: "Most popular",
    features: [
      {
        label: "14-day money-back guarantee",
        tone: "emphasis",
      },
      {
        label: "Get full access to the report",
      },
      {
        label: "All sections unlocked",
      },
      {
        label: "18 analysed dimensions",
      },
      {
        label: "Share report with up to 2 emails",
      },
    ],
    plan: "full_report",
    price: "\u20AC29.99",
    priceSuffix: "/one off",
    strikePrice: "\u20AC59.00 one off",
    title: "Full report",
    tone: "highlight",
  },
  {
    badge: "32% OFF",
    badgeTone: "accent",
    ctaLabel: "Unlock all reports",
    description: "Built for those wanting to explore all archetypes",
    features: [
      {
        label: "All 14 archetypes unlocked",
      },
      {
        label: "All benefits as full report",
      },
      {
        label: "Perfect for comparison across patterns",
      },
    ],
    plan: "all_reports",
    price: "\u20AC129.99",
    priceSuffix: "/one off",
    strikePrice: "\u20AC190.00 one off",
    title: "All reports",
  },
];

function PricingMethodMark({
  children,
  icon,
  tone,
}: {
  children: ReactNode;
  icon?: "apple" | "google";
  tone?: "paypal" | "klarna" | "visa";
}) {
  return (
    <span
      className={[
        "report-pricing-modal__payment-method",
        tone ? `report-pricing-modal__payment-mark--${tone}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon ? (
        <span
          className={`report-pricing-modal__payment-icon report-pricing-modal__payment-icon--${icon}`}
          aria-hidden="true"
        />
      ) : null}
      <span className="report-pricing-modal__payment-mark">{children}</span>
    </span>
  );
}

const ReportPricingModal: FC<Props> = ({ archetype, open, onClose, onUnlock, returnFocusRef }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const didOpenRef = useRef(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

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

    const overflow = document.body.style.overflow;
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

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <div
      className={`report-pricing-modal ${open ? "is-visible" : "is-hidden"}`}
      data-state={open ? "open" : "closed"}
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
              {pricingCards.map((card) => (
                <article
                  key={card.title}
                  role="listitem"
                  className={[
                    "report-pricing-card",
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
                    {card.strikePrice ? (
                      <span className="report-pricing-card__strike">{card.strikePrice}</span>
                    ) : null}
                    <div className="report-pricing-card__price-row">
                      <strong>{card.price}</strong>
                      <span>{card.priceSuffix}</span>
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
              <PricingMethodMark icon="apple">Apple Pay</PricingMethodMark>
              <PricingMethodMark tone="paypal">PayPal</PricingMethodMark>
              <PricingMethodMark icon="google">Google Pay</PricingMethodMark>
              <PricingMethodMark tone="klarna">Klarna.</PricingMethodMark>
              <span className="report-pricing-modal__mastercard" aria-label="Mastercard">
                <span />
                <span />
              </span>
              <PricingMethodMark tone="visa">VISA</PricingMethodMark>
              <span className="report-pricing-modal__amex">AMEX</span>
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
