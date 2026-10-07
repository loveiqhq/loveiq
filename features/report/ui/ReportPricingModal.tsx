"use client";

import Image from "next/image";
import {
  useState,
  useEffect,
  useRef,
  type FC,
  type MutableRefObject,
  type ReactNode,
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
import type {
  ReportPriceQuotes,
  ReportPriceQuoteSnapshot,
} from "@features/pricing/logic/reportPricing";
import TrustpilotReviews from "@shared/ui/trustpilot/TrustpilotReviews";
import { isTrustpilotEnabled } from "@shared/ui/trustpilot/config";
import { isPlanOwnedForArchetype, type ReportAccessPlan } from "@features/report/server/access";
import {
  trackPaywallDismissed,
  trackPriceShown,
  type PaywallDismissSource,
} from "@features/analytics/client";
import { lockBodyScroll, unlockBodyScroll } from "@shared/ui/body-scroll-lock";
import "./paygate.css";

/**
 * The paygate — Pricing 3.0's two plans, as Marcus and Mark finalised them at the
 * 1 Oct sync: paygate-mobile (Figma 842:584) below 960px, paygate-desktop (963:6)
 * from there, with the "Most popular" pill (987:624) on All 14 in both.
 *
 * Kept from the frames on purpose, and why:
 *   - "14-day money-back guarantee." on BOTH cards. The single report's frames say
 *     7-day; Fatih, 29.09, kept the 14 days the Terms, the landing page and every
 *     other surface promise (V4PremiumCard, the sticky footer), flagged to Mark.
 *   - Prices in the site's own format, "€39.99", as Stripe, the emails and the
 *     report show them — not the frames' "€39,99".
 *   - The frames' slips put right: a duplicated "Your complete archetype report" row,
 *     "report s", desktop card 01's "Money-back guarantee." twice, the first review's
 *     missing opening quote. Where the two frames word a card differently the phone
 *     takes the phone's copy (paygate-mobile is the more complete) — except the single
 *     report's title and line, which each frame gives its own (`stackedTitle`).
 *   - No page footer: 963:6's "© 2026 Archetype Reports" bar is page chrome, and this
 *     is a dialog over the report. The close button stays for the same reason.
 */

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
  /**
   * The `price_shown` keys already sent this report visit, held by the page, which
   * outlives this modal. Without it (a standalone preview), the modal's own lifetime.
   */
  priceShownFiredRef?: MutableRefObject<Set<string>>;
  quotes: ReportPriceQuotes | null;
  returnFocusRef?: MutableRefObject<HTMLElement | null>;
  targetArchetype?: string | null;
  /**
   * "default" — original behaviour.
   * "offer" — discount email deep-link (?offer=1). Draws the same screen; the code is
   *   applied on Stripe's page.
   * "recipient" — someone reading a report that was shared with them. Only its owner can
   *   unlock it, so no prices: the way forward is a report of their own.
   */
  variant?: "default" | "offer" | "recipient";
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * "Why unlock your Report?" — 842:658 / 963:86. `lead`, then `emph` in the brand gradient.
 * Every heading here is in the report's 02.10 heading case (features/report/logic/titleCase.ts);
 * the frames still carry the sentence case they were drawn in.
 */
const WHY_CARDS: ReadonlyArray<{
  body: string;
  emph: string;
  /** 842:660 sets "Money-back guarantee." in the guarantee's green, bold. */
  green?: string;
  lead?: string;
  tail?: string;
}> = [
  {
    green: "Money-Back Guarantee.",
    emph: "Zero Risk.",
    body: "Read the full report. If it doesn’t land, every cent back, no questions asked.",
  },
  {
    emph: "Insights From Hundreds of Research Papers and Books.",
    body: "Your report is based on insights from hundreds of scientific papers and leading books on sexuality.",
  },
  {
    // 963:94's "50+"; 842:663 has "+ 50", with a stray space.
    emph: "50+ Pages",
    tail: " That Can Change Your Life",
    body: "Most of us were never taught any of this. Your report finally puts language to it.",
  },
  {
    lead: "Become ",
    emph: "an Expert Around Your Sexuality",
    body: "Learn the essential concepts and language to better understand and improve your sexuality grounded in the latest science and practical wisdom.",
  },
];

/**
 * "Real people love & appreciate our insights." — 842:684 / 987:757. The quote is set
 * in Lora Italic with its key phrase upright (Lora Regular), the frames' own emphasis.
 */
const REVIEWS: ReadonlyArray<{
  avatar: string;
  emph: string;
  name: string;
  post: string;
  pre: string;
  role: string;
}> = [
  {
    avatar: "/report/paygate/avatar-dorian.png",
    name: "Dorian, 34",
    role: "File manager",
    pre: "“The ",
    emph: "results are extensive and spot-on",
    post: ", without the test being too long. I got to know myself better, and it will help my partner understand me better as well.”",
  },
  {
    avatar: "/report/paygate/avatar-richard.png",
    name: "Richard Petrich, 34",
    role: "Entrepreneur",
    pre: "“The results were ",
    emph: "more insightful than I expected",
    post: ". It connected dots between emotional triggers and communication styles I hadn’t noticed before. Solid UX, too.”",
  },
  {
    avatar: "/report/paygate/avatar-philipp.png",
    name: "Philipp Leonhard, 42",
    role: "Product Owner IT",
    pre: "“I’d never really explored my sexuality or the patterns behind it before. I already learned a lot just from taking the test, but the ",
    emph: "insights in the full report were truly eye-opening. Absolutely worth it.",
    post: "”",
  },
  {
    avatar: "/report/paygate/avatar-marija.png",
    name: "Marija Mustapić, 41",
    role: "IT Infrastructure",
    pre: "“Unlocking my report was ",
    emph: "one of the best investments made for my sexuality",
    post: ". It is shockingly precise.”",
  },
];

/**
 * 842:591's row: Apple Pay, Visa, Google Pay, Klarna, American Express, Mastercard.
 * The marks are the frame's own artwork (public/report/paygate/mark-*.svg), except
 * Apple Pay's: 842:591 sets "Pay" after U+F8FF, a glyph only Apple's fonts have, so
 * that one is cut from the repo's Apple Pay mark (public/payment-logos). PayPal is not
 * in the row: Checkout cannot take PayPal (#451 on main).
 */
const PAYMENT_MARKS = [
  { logo: "apple-pay", label: "Apple Pay" },
  { logo: "visa", label: "Visa" },
  { logo: "google-pay", label: "Google Pay" },
  { logo: "klarna", label: "Klarna" },
  { logo: "amex", label: "American Express" },
  { logo: "mastercard", label: "Mastercard" },
] as const;

/** The brand gradient over a run of text (842:597's "Sexual Self"). */
const Gradient: FC<{ children: ReactNode }> = ({ children }) => (
  <em className="rpg-gradient">{children}</em>
);

function getCardPricing(quote: ReportPriceQuoteSnapshot | null | undefined) {
  if (!quote) {
    return { available: false, offLabel: null, priceLabel: null, strikeLabel: null } as const;
  }
  // The charged price, which every surface and the Stripe line item read. The strike
  // and the "N% off" both compare against it, so a bucket priced at its own anchor
  // (the single report, both arms) simply draws no strike.
  const currentCents = quote.chargedPriceCents;
  // All 14 after buying single reports: the price before the credit is struck, and the
  // line says what was already paid instead of a percentage.
  const creditCents = quote.upgradeCreditCents ?? 0;
  if (creditCents > 0) {
    return {
      available: true,
      offLabel: `${formatReportPurchasePrice(creditCents)} already paid`,
      priceLabel: formatReportPurchasePrice(currentCents),
      strikeLabel: formatReportPurchasePrice(currentCents + creditCents),
    } as const;
  }
  const strikeLabel = getReportPurchaseStrikePrice(quote.msrpCents, currentCents);
  const badge = strikeLabel
    ? getReportPurchaseBadgeFromPrice({ strikeCents: quote.msrpCents, currentCents })
    : null;
  return {
    available: true,
    // "20% OFF" → the frames' "20% off".
    offLabel: badge ? badge.toLowerCase() : null,
    priceLabel: formatReportPurchasePrice(currentCents),
    strikeLabel,
  } as const;
}

/** A card's title: its lead in the card's emphasis, the rest in Lora Regular. */
const CardTitle: FC<{ lead: string; text: string }> = ({ lead, text }) => (
  <>
    <span className="rpg-card__lead">{lead}</span>
    {text.startsWith(lead) ? text.slice(lead.length) : ` ${text}`}
  </>
);

const ReportPricingModal: FC<Props> = ({
  accessPlan = null,
  archetype,
  archetypeTiers,
  open,
  onClose,
  onUnlock,
  primaryArchetype = null,
  priceShownFiredRef,
  quotes,
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
  const touchStartYRef = useRef<number | null>(null);
  const [focusMode, setFocusMode] = useState<"keyboard" | "pointer">("pointer");

  const isRecipient = variant === "recipient";

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
  // The variant and archetype it opened as: ReportPage resets both (to "default", and the
  // target to none) in the same render that closes the modal, so by the time this effect
  // sees the close they would read "default" and the reader's own archetype.
  const openedVariantRef = useRef(variant);
  const openedScopeRef = useRef(scopeArchetype);
  const dismissReasonRef = useRef<PaywallDismissSource | null>(null);
  const checkoutInitiatedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      if (openedAtRef.current > 0) {
        // A recipient was never offered a price, so closing is not a paywall dismissal.
        if (!checkoutInitiatedRef.current && openedVariantRef.current !== "recipient") {
          trackPaywallDismissed({
            source: dismissReasonRef.current ?? "browser_back",
            view_duration_ms: performance.now() - openedAtRef.current,
            archetype: openedScopeRef.current ?? null,
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
      openedVariantRef.current = variant;
      openedScopeRef.current = scopeArchetype;
    }
    // Only an open or a close matters here; what it opened as is kept in the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Per-plan `price_shown` emit. Deduped by (plan, pricingClusterId, discountStep)
  // for the whole report visit: the ladder advancing emits a new event, but
  // re-opening the modal does NOT (the set is never cleared). The page holds the
  // set (`priceShownFiredRef`), because this modal is rebuilt whenever the report
  // reloads its data, on every archetype switch; a set of its own re-sent every
  // price each time. Powers the "Price Shown" funnel column + per-cluster CVR
  // analysis (bucket_performance counts these events), so emitting on every
  // opening would change those rates; the UX checker's CTA hesitation allows for
  // it (features/ux-signals/logic/signals.ts).
  const ownPriceShownFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    if (!quotes) return;
    const fired = (priceShownFiredRef ?? ownPriceShownFiredRef).current;
    for (const card of REPORT_PURCHASE_PLANS) {
      const quote = quotes[card.plan];
      if (!quote) continue;
      const dedupeKey = `${card.plan}:${quote.pricingClusterId}:${quote.discountStep}`;
      if (fired.has(dedupeKey)) continue;
      fired.add(dedupeKey);
      trackPriceShown({
        plan: card.plan,
        price: quote.chargedPriceCents / 100,
        currency: quote.currency,
        bucket: quote.basePriceBucket,
        pricing_cluster_id: quote.pricingClusterId,
        discount_step: quote.discountStep,
        experiment_group: quote.experimentGroup,
        msrp: quote.msrpCents / 100,
        initial_price: quote.initialPriceCents / 100,
      });
    }
  }, [open, quotes, priceShownFiredRef]);

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
      // Without scrolling to it: the modal often opens by itself as the reader scrolls,
      // so what had focus is what they last clicked, often far above, and focusing it
      // scrolled the page up to it (Mark, desktop review 30.09: "it scrolls up weirdly").
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget && restoreTarget.isConnected) {
        restoreTarget.focus({ preventScroll: true });
      } else {
        returnFocusRef?.current?.focus({ preventScroll: true });
      }
      didOpenRef.current = false;
    }
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;

    lockBodyScroll();

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
      unlockBodyScroll();
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
      className={`report-pricing-modal report-pricing-modal--white report-pricing-modal--paygate ${open ? "is-visible" : "is-hidden"}`}
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

      {/* A tap outside the dialog closes it, as the backdrop's handler above intends. The
          viewport covers the backdrop edge to edge (it is later in the page and positioned),
          so that tap lands HERE and never reached the backdrop: measured on production on
          2026-10-01, a tap beside the dialog hit this div and left the paywall open, on a
          desktop and an iPhone, and none of 171 closes in 30 days came from a tap outside.
          Only a tap on the viewport itself: one inside the dialog bubbles up to here too. */}
      <div
        className="report-pricing-modal__viewport"
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          dismissReasonRef.current = "backdrop";
          onClose();
        }}
      >
        <div
          ref={dialogRef}
          role={open ? "dialog" : undefined}
          aria-modal={open ? "true" : undefined}
          aria-labelledby={open ? "report-pricing-modal-title" : undefined}
          aria-describedby={open && isRecipient ? "report-pricing-modal-copy" : undefined}
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
            <div className="rpg">
              <div className="rpg__top">
                {/* 842:597 / 963:15 */}
                <header className="rpg__hero">
                  {isRecipient ? (
                    <>
                      <h2 id="report-pricing-modal-title" className="rpg__title">
                        Discover Your <br className="rpg__title-break" />
                        <Gradient>Sexual Self</Gradient>
                      </h2>
                      <p id="report-pricing-modal-copy" className="rpg__copy">
                        Only the person who shared this report can unlock it. Take the free test to
                        get a report of your own.
                      </p>
                    </>
                  ) : (
                    <h2 id="report-pricing-modal-title" className="rpg__title">
                      {/* 842:597 sets "Sexual Self" on a line of its own; 963:15 runs it on. */}
                      Discover Your Full <br className="rpg__title-break" />
                      <Gradient>Sexual Self</Gradient>
                    </h2>
                  )}
                  {!quotes && !isRecipient ? (
                    <p className="rpg__copy rpg__copy--alert" role="alert">
                      Live pricing couldn&apos;t be loaded right now. Reload the page and try again.
                    </p>
                  ) : null}
                </header>

                {/* A grid, so the payment marks can sit between the cards on the phone
                    (842:672) and under both from 960px (963:76) in one DOM order. */}
                {isRecipient ? (
                  <a
                    className="rpg-card__cta rpg-card__cta--filled rpg__recipient-cta"
                    href="/survey"
                  >
                    Take the Free Test<span aria-hidden="true">{"\u00a0→"}</span>
                  </a>
                ) : (
                  <div className="rpg__tiers" role="group" aria-label="Pricing options">
                    {REPORT_PURCHASE_PLANS.map((card) => (
                      <PlanCard
                        key={card.plan}
                        card={card}
                        isOwned={isPlanOwnedForArchetype({
                          accessPlan,
                          targetPlan: card.plan,
                          unlockedTier,
                        })}
                        pricing={getCardPricing(quotes?.[card.plan])}
                        targetArchetype={targetArchetype}
                        onBuy={() => {
                          // Mark conversion intent so the open→close effect doesn't
                          // double-count this as a dismissal. begin_checkout is counted by
                          // ReportPage.beginCheckout, which onUnlock reaches.
                          checkoutInitiatedRef.current = true;
                          onUnlock(
                            card.plan,
                            // The single report is per-archetype: if the modal wasn't opened
                            // scoped to a specific tile, the buyer is unlocking their primary
                            // archetype. all_reports is global and the parent strips it anyway.
                            card.plan === "all_reports"
                              ? null
                              : (targetArchetype ?? primaryArchetype ?? archetype)
                          );
                        }}
                      />
                    ))}

                    {/* 842:672 / 963:76 — under All 14 on the phone, under both from 960px. */}
                    <div className="rpg__payments">
                      <p className="rpg__payments-label">Guaranteed Safe &amp; Secure Checkout</p>
                      <div className="rpg__payments-row" aria-label="Accepted payment methods">
                        {PAYMENT_MARKS.map(({ logo, label }) => (
                          <span
                            key={logo}
                            className={`rpg__mark rpg__mark--${logo}`}
                            role="img"
                            aria-label={label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 842:656 / 963:84 — why to pay, so not for a recipient, who cannot. */}
              {isRecipient ? null : (
                <section className="rpg__why" aria-labelledby="rpg-why-title">
                  <h3 id="rpg-why-title" className="rpg__section-title">
                    Why Unlock Your <Gradient>Report</Gradient>?
                  </h3>
                  <div className="rpg__why-grid">
                    {WHY_CARDS.map(({ green, lead, emph, tail, body }) => (
                      <article key={emph} className="rpg-why">
                        <h4 className="rpg-why__title">
                          {green ? <span className="rpg-why__green">{green} </span> : null}
                          {lead}
                          <Gradient>{emph}</Gradient>
                          {tail}
                        </h4>
                        <p className="rpg-why__body">{body}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {/* 842:682 / 963:99 */}
              <section className="rpg__reviews" aria-labelledby="rpg-reviews-title">
                <h3 id="rpg-reviews-title" className="rpg__section-title">
                  Real <Gradient>People</Gradient> Love &amp; Appreciate Our{" "}
                  <Gradient>Insights.</Gradient>
                </h3>
                <ul className="rpg__reviews-grid">
                  {REVIEWS.map((review) => (
                    <li key={review.name} className="rpg-review">
                      <div className="rpg-review__head">
                        <Image
                          className="rpg-review__avatar"
                          src={review.avatar}
                          alt=""
                          width={40}
                          height={40}
                        />
                        <span className="rpg-review__who">
                          <span className="rpg-review__name">{review.name}</span>
                          <span className="rpg-review__role">{review.role}</span>
                        </span>
                        <Image
                          className="rpg-review__stars"
                          src="/report/paygate/stars.svg"
                          alt="5 out of 5 stars"
                          width={58}
                          height={10}
                          unoptimized
                        />
                      </div>
                      <blockquote className="rpg-review__quote">
                        {review.pre}
                        <span className="rpg-review__emph">{review.emph}</span>
                        {review.post}
                      </blockquote>
                    </li>
                  ))}
                </ul>
              </section>

              {isTrustpilotEnabled() && <TrustpilotReviews variant="carousel" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** One plan (844:1229 / 844:1265, 963:18 / 963:48). */
const PlanCard: FC<{
  card: ReportPurchasePlan;
  isOwned: boolean;
  onBuy: () => void;
  pricing: ReturnType<typeof getCardPricing>;
  targetArchetype: string | null;
}> = ({ card, isOwned, onBuy, pricing, targetArchetype }) => {
  const isHero = card.tone === "highlight";
  // Opened from another archetype's tile, the single report unlocks THAT archetype,
  // so it says so rather than "your highest".
  const scoped = Boolean(targetArchetype) && card.plan === "full_report";
  const title = scoped ? `${card.titleLead} the ${targetArchetype} Report` : card.title;
  const stackedTitle = scoped ? title : (card.stackedTitle ?? card.title);
  const description = scoped ? `Your full ${targetArchetype} report` : card.description;
  const stackedDescription = scoped ? description : (card.stackedDescription ?? card.description);
  const ctaLabel = scoped ? "Only Unlock This Report" : card.ctaLabel;
  const disabled = isOwned || !pricing.available;

  return (
    <article
      className={`rpg-card rpg-card--${card.plan}${isHero ? " rpg-card--hero" : ""}${
        isOwned ? " is-owned" : ""
      }`}
    >
      {card.featuredLabel ? <span className="rpg-card__badge">{card.featuredLabel}</span> : null}

      <div className="rpg-card__head">
        <h3 className="rpg-card__title">
          {/* Each layout's own wording (see `stackedTitle`); only one is ever displayed. */}
          <span className="rpg-card__wide">
            <CardTitle lead={card.titleLead} text={title} />
          </span>
          <span className="rpg-card__stacked">
            <CardTitle lead={card.titleLead} text={stackedTitle} />
          </span>
        </h3>
        <p className="rpg-card__desc">
          <span className="rpg-card__wide">{renderDescription(description)}</span>
          <span className="rpg-card__stacked">{renderDescription(stackedDescription)}</span>
        </p>
      </div>

      <div className={`rpg-card__pricing${pricing.strikeLabel ? "" : " has-no-strike"}`}>
        {pricing.strikeLabel ? (
          <p className="rpg-card__was">
            <s>{pricing.strikeLabel}</s>
            {pricing.offLabel ? (
              <>
                {" - "}
                <span className="rpg-card__off">{pricing.offLabel}</span>
              </>
            ) : null}
          </p>
        ) : null}
        <p className="rpg-card__price">
          {pricing.available ? (
            <>
              <span className="rpg-card__amount">{pricing.priceLabel}</span>{" "}
              <span className="rpg-card__suffix">{card.priceSuffix}</span>
            </>
          ) : (
            <span className="rpg-card__unavailable">Pricing unavailable</span>
          )}
        </p>
      </div>

      <button
        type="button"
        className={`rpg-card__cta ${isHero ? "rpg-card__cta--filled" : "rpg-card__cta--outline"}`}
        disabled={disabled}
        aria-disabled={disabled}
        onClick={disabled ? undefined : onBuy}
      >
        {isOwned ? (
          "Your current plan"
        ) : (
          // One run of text, so a label too long for a narrow phone wraps as a line of
          // text does and takes the arrow with it; the no-break space keeps the arrow on
          // the last word.
          <span>
            {ctaLabel}
            <span aria-hidden="true">{"\u00a0→"}</span>
          </span>
        )}
      </button>

      <div className="rpg-card__details">
        <p className="rpg-card__guarantee">
          <Image
            src="/report/paygate/shield.svg"
            alt=""
            width={15}
            height={15}
            unoptimized
            aria-hidden="true"
          />
          14-day money-back guarantee.
        </p>
        <ul className="rpg-card__features">
          {card.features.map((feature) => (
            <li
              key={feature.label}
              className={`rpg-card__feature${feature.included ? "" : " is-excluded"}`}
            >
              <Image
                src={
                  feature.included ? "/report/paygate/check.svg" : "/report/paygate/check-muted.svg"
                }
                alt=""
                width={16}
                height={16}
                unoptimized
                aria-hidden="true"
              />
              <span>
                {feature.label}
                {feature.included ? null : <span className="rpg-sr-only"> (not included)</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
};

/**
 * 844:1234 / 963:23 set what follows the "+" in Bold ("Your full archetype report +
 * Access to all 14 archetype reports"); a description without one is plain.
 */
function renderDescription(text: string): ReactNode {
  const plus = text.indexOf(" + ");
  if (plus < 0) return text;
  return (
    <>
      {text.slice(0, plus + 3)}
      <strong>{text.slice(plus + 3)}</strong>
    </>
  );
}

export default ReportPricingModal;
