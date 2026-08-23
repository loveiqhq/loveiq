"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { PadlockIcon } from "./ReportNavBadge";
import {
  PaywallCountdownPill,
  PaywallCountdownTiles,
  usePaywallCountdownValue,
} from "./PaywallCountdown";
import PaywallTestimonials from "./PaywallTestimonials";
import { REPORT_PAYWALL_COUNTDOWN_MS } from "@features/survey/ui/hooks/surveySession";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import {
  formatReportPurchasePrice,
  getReportPurchaseBadgeFromPrice,
  getReportPurchaseStrikePrice,
} from "@features/checkout/server/reportPurchase";
import {
  trackBeginCheckout,
  trackPriceShown,
  trackScrollPaywallDismissed,
  trackScrollPaywallShown,
  type PaywallDismissSource,
} from "@features/analytics/client";
import { restoreScroll } from "@shared/ui/restore-scroll";

interface Props {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
  userName?: string | null;
  quote: ReportPriceQuoteSnapshot | null;
  /**
   * When false, the modal cannot be dismissed: the close button is hidden and
   * Escape / backdrop clicks are ignored. The only way forward is checkout.
   * Used by the coupled paywall experiment's "treatment" arm. Defaults to true.
   */
  dismissible?: boolean;
  /**
   * Epoch-ms deadline for the urgency countdown, resolved once per report
   * session by the caller (persisted in sessionStorage so it survives
   * reopening). Falls back to a fresh 3-minute window when omitted.
   */
  offerDeadline?: number;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Brand gradient used for emphasised words + the headline price (Figma:
// orange → violet → blue). bg-clip-text renders it as gradient text.
const BRAND_GRADIENT = "linear-gradient(120deg, #ff6a3a 0%, #cf5afb 52%, #7d88ff 100%)";
const gradientTextStyle: CSSProperties = {
  backgroundImage: BRAND_GRADIENT,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

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

// ─── Small helpers ────────────────────────────────────────────────────────────

/** Circle-check used in the pricing card feature list, "You save", and offer pill. */
function GreenCheck({ size = 18, color = "#1f8a5b" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="7.4" stroke={color} strokeWidth="1.1" />
      <path
        d="M4.6 8.1 6.9 10.3 11.4 5.6"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The "Locked · in your report" chip's padlock.
 *
 * Delegates to the report's shared `PadlockIcon` rather than drawing a fourth
 * padlock: this file had its own 12x14 outline with a hardcoded #9a96a6 stroke,
 * so the same idea was drawn differently here than in the nav and the insight
 * map. The wrapper keeps the call sites and the size prop unchanged.
 */
function LockGlyph({ size = 12 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-flex", flexShrink: 0, width: size, height: (size * 14) / 12 }}
    >
      <PadlockIcon open={false} />
    </span>
  );
}

// ─── Content data ─────────────────────────────────────────────────────────────

// "Why unlock" cards (2×2). Each title = bold ink lead + italic gradient
// emphasis. Card 04's body is price-prefixed (filled in at render).
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

const CHAPTER_CARDS = [
  {
    num: "01",
    topic: "Your core archetype",
    why: "Understand the main pattern shaping your sexuality, attraction, emotional needs, and relationship behaviour.",
  },
  {
    num: "02",
    topic: "Other archetype influences",
    why: "See the secondary patterns that add nuance, tension, or hidden layers to your personality.",
  },
  {
    num: "03",
    topic: "Your core motivation",
    why: "Learn what you’re truly seeking underneath desire — safety, intensity, freedom, or depth.",
  },
  {
    num: "04",
    topic: "Your attachment style",
    why: "See how your bonds form — what makes you reach for closeness, and what makes you pull away.",
  },
  {
    num: "05",
    topic: "The importance of sexuality",
    why: "See how central sex is to your aliveness and well-being right now — and why “more” or “less” isn’t better, only mismatched.",
  },
] as const;

const PAYMENT_METHODS = [
  { key: "apple-pay", label: "Apple Pay" },
  { key: "paypal", label: "PayPal" },
  { key: "google-pay", label: "Google Pay" },
  { key: "klarna", label: "Klarna" },
  { key: "mastercard", label: "Mastercard" },
  { key: "visa", label: "Visa" },
  { key: "amex", label: "Amex" },
];

// ─── Main component ───────────────────────────────────────────────────────────

const ScrollPricingModal: FC<Props> = ({
  open,
  onClose,
  onCheckout,
  userName,
  quote,
  dismissible = true,
  offerDeadline,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const scrollLockRef = useRef<ScrollLockState | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const didOpenRef = useRef(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [focusMode, setFocusMode] = useState<"keyboard" | "pointer">("pointer");
  const [portalMounted, setPortalMounted] = useState(false);

  // Modal-shown impression (both arms). Re-arms on close so a control re-open
  // is counted again. Keyed on `open` only — never re-fires on a view switch.
  const shownFiredRef = useRef(false);
  useEffect(() => {
    if (!open) {
      shownFiredRef.current = false;
      return;
    }
    if (shownFiredRef.current) return;
    shownFiredRef.current = true;
    trackScrollPaywallShown({ surface: "report_scroll_paywall" });
  }, [open]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount flip to enable client-only portal
    setPortalMounted(true);
  }, []);

  const priceShownFiredRef = useRef(false);

  // ── Analytics ──────────────────────────────────────────────────────────────
  const openedAtRef = useRef(0);
  const dismissReasonRef = useRef<PaywallDismissSource | null>(null);
  const checkoutInitiatedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      priceShownFiredRef.current = false;
      if (openedAtRef.current > 0) {
        // A non-dismissible (forced) modal has no real "dismiss" — if it closes
        // it's because the app swapped surfaces or navigated to checkout.
        if (!checkoutInitiatedRef.current && dismissible) {
          trackScrollPaywallDismissed({
            source: dismissReasonRef.current ?? "browser_back",
            view_duration_ms: performance.now() - openedAtRef.current,
          });
        }
        openedAtRef.current = 0;
        dismissReasonRef.current = null;
        checkoutInitiatedRef.current = false;
      }
      return;
    }
    // Record the open time as soon as the modal opens — independent of the quote,
    // which may still be loading. Otherwise view_duration_ms starts late.
    if (openedAtRef.current === 0) {
      openedAtRef.current = performance.now();
    }
  }, [dismissible, open]);

  useEffect(() => {
    if (!open || priceShownFiredRef.current || !quote) return;
    priceShownFiredRef.current = true;
    trackPriceShown({
      plan: "full_report",
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
  }, [open, quote]);

  // ── Focus management ───────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      didOpenRef.current = true;
      requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
      return;
    }
    if (didOpenRef.current) {
      restoreFocusRef.current?.focus();
      didOpenRef.current = false;
    }
  }, [open]);

  // ── Scroll lock + keyboard ─────────────────────────────────────────────────
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") setFocusMode("keyboard");
      if (e.key === "Escape") {
        e.preventDefault();
        if (dismissible) {
          dismissReasonRef.current = "escape";
          onClose();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
      ).filter((el) => !el.closest("[inert]") && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (scrollRegionRef.current?.contains(e.target as Node | null)) return;
      e.preventDefault();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      const lock = scrollLockRef.current;
      document.documentElement.style.overflow = lock?.htmlOverflow ?? "";
      document.body.style.left = lock?.bodyLeft ?? "";
      document.body.style.overflow = lock?.bodyOverflow ?? "";
      document.body.style.position = lock?.bodyPosition ?? "";
      document.body.style.right = lock?.bodyRight ?? "";
      document.body.style.top = lock?.bodyTop ?? "";
      document.body.style.width = lock?.bodyWidth ?? "";
      if (lock) restoreScroll(lock.scrollY);
      scrollLockRef.current = null;
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [dismissible, onClose, open]);

  // ── Touch scroll handling ──────────────────────────────────────────────────
  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    const sr = scrollRegionRef.current;
    const startY = touchStartYRef.current;
    const currentY = e.touches[0]?.clientY;
    if (!sr || startY === null || currentY === undefined) return;
    const delta = currentY - startY;
    const noOverflow = sr.scrollHeight <= sr.clientHeight + 1;
    const atTop = sr.scrollTop <= 0;
    const atBottom = sr.scrollTop + sr.clientHeight >= sr.scrollHeight - 1;
    if (noOverflow || (atTop && delta > 0) || (atBottom && delta < 0)) e.preventDefault();
  };

  const resetTouch = () => {
    touchStartYRef.current = null;
  };

  // ── Pricing ────────────────────────────────────────────────────────────────
  // `chargedPriceCents` carries the urgency surcharge; the same field feeds the locked
  // cards, the plan modal, /checkout and the Stripe line item.
  const currentCents = quote?.chargedPriceCents ?? 0;
  const msrpCents = quote?.msrpCents ?? null;
  const strikeEligible = typeof msrpCents === "number" && msrpCents > currentCents;
  const strikePriceLabel = strikeEligible ? getReportPurchaseStrikePrice(msrpCents) : null;
  const priceLabel = quote ? formatReportPurchasePrice(currentCents) : "—";
  const badge = quote
    ? getReportPurchaseBadgeFromPrice({ strikeCents: msrpCents, currentCents })
    : null;
  const saveLabel =
    strikeEligible && msrpCents != null
      ? formatReportPurchasePrice(msrpCents - currentCents)
      : null;

  const displayName = userName ?? "Friend";

  // ── Countdown — reads the report-level shared ticker (ONE interval for the
  //    whole locked report: every card + this modal), so all timers show the
  //    exact same MM:SS. Context flows through the portal. Standalone (no
  //    provider, e.g. unit tests) falls back to a local ticker seeded from the
  //    persisted deadline. ─────────────────────────────────────────────────────
  const [fallbackDeadline] = useState(() =>
    typeof window === "undefined" ? 0 : Date.now() + REPORT_PAYWALL_COUNTDOWN_MS
  );
  const deadline = offerDeadline ?? fallbackDeadline;
  const { mm, ss, expired } = usePaywallCountdownValue(deadline);

  // Offer pill: drop "· expires soon" once the timer has elapsed so it never
  // contradicts a 00:00 readout. The remaining badge is still honest — it is recomputed
  // from the price actually being charged, which now includes the surcharge, so the
  // percentage shrinks rather than lying.
  const offerPillText = badge
    ? expired
      ? `${badge.replace(/\s*off\s*$/i, "")} off`
      : `${badge.replace(/\s*off\s*$/i, "")} off · expires soon`
    : null;

  const handleCtaClick = () => {
    checkoutInitiatedRef.current = true;
    if (quote) {
      trackBeginCheckout("full_report", quote.chargedPriceCents / 100, quote.currency);
    }
    onCheckout();
  };

  const handleStickyCta = () => {
    handleCtaClick();
  };

  // ── Why-unlock mobile carousel ─────────────────────────────────────────────
  const whyTrackRef = useRef<HTMLDivElement>(null);
  const [whyPage, setWhyPage] = useState(0);
  const WHY_PAGES = WHY_CARDS.length;

  const scrollWhyToPage = (page: number) => {
    const track = whyTrackRef.current;
    if (!track) return;
    const card = track.children[page] as HTMLElement | undefined;
    if (!card) return;
    track.scrollTo({ left: card.offsetLeft - 16, behavior: "smooth" });
    setWhyPage(page);
  };

  // ── Chapter carousel ────────────────────────────────────────────────────────
  const chapterTrackRef = useRef<HTMLDivElement>(null);
  const [chapterPage, setChapterPage] = useState(0);
  const CHAPTER_PAGES = CHAPTER_CARDS.length;
  const chapterDragRef = useRef({
    isDragging: false,
    startX: 0,
    startScrollLeft: 0,
    startY: 0,
    directionLocked: null as "horizontal" | "vertical" | null,
  });

  const scrollChapterToPage = (page: number) => {
    const track = chapterTrackRef.current;
    if (!track) return;
    const card = track.children[page] as HTMLElement | undefined;
    if (!card) return;
    track.scrollTo({ left: card.offsetLeft - 4, behavior: "smooth" });
    setChapterPage(page);
  };

  const onChapterDragStart = (clientX: number, clientY: number) => {
    const track = chapterTrackRef.current;
    if (!track) return;
    chapterDragRef.current = {
      isDragging: true,
      startX: clientX,
      startScrollLeft: track.scrollLeft,
      startY: clientY,
      directionLocked: null,
    };
  };

  const onChapterDragMove = (clientX: number, clientY: number, e?: ReactTouchEvent) => {
    const drag = chapterDragRef.current;
    if (!drag.isDragging) return;
    const dX = Math.abs(clientX - drag.startX);
    const dY = Math.abs(clientY - drag.startY);
    if (drag.directionLocked === null && (dX > 5 || dY > 5)) {
      chapterDragRef.current.directionLocked = dX > dY ? "horizontal" : "vertical";
    }
    if (drag.directionLocked === "vertical") {
      chapterDragRef.current.isDragging = false;
      return;
    }
    if (drag.directionLocked === "horizontal" && e) e.preventDefault();
    const track = chapterTrackRef.current;
    if (track) track.scrollLeft = drag.startScrollLeft - (clientX - drag.startX);
  };

  const onChapterDragEnd = () => {
    chapterDragRef.current.isDragging = false;
    chapterDragRef.current.directionLocked = null;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!portalMounted) return null;

  return createPortal(
    <div
      className={`report-pricing-modal report-pricing-modal--white ${open ? "is-visible" : "is-hidden"}`}
      data-state={open ? "open" : "closed"}
      data-focus-mode={focusMode}
      aria-hidden={!open}
    >
      <div
        className="report-pricing-modal__backdrop"
        aria-hidden="true"
        onClick={() => {
          if (!dismissible) return;
          dismissReasonRef.current = "backdrop";
          onClose();
        }}
      />
      <div className="report-pricing-modal__viewport">
        <div
          ref={dialogRef}
          role={open ? "dialog" : undefined}
          aria-modal={open ? "true" : undefined}
          aria-labelledby={open ? "scroll-teaser-title" : undefined}
          className="report-pricing-modal__dialog"
          tabIndex={-1}
          onPointerDown={() => setFocusMode("pointer")}
        >
          {dismissible && (
            <button
              type="button"
              className="report-pricing-modal__close report-pricing-modal__close--labeled"
              onClick={() => {
                dismissReasonRef.current = "close_button";
                onClose();
              }}
            >
              <span className="report-pricing-modal__close-label">Close to view report</span>
              <span className="report-pricing-modal__close-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </span>
            </button>
          )}

          <div
            ref={scrollRegionRef}
            className="report-pricing-modal__scroll-region"
            data-lenis-prevent
            onTouchCancel={resetTouch}
            onTouchEnd={resetTouch}
            onTouchMove={handleTouchMove}
            onTouchStart={handleTouchStart}
          >
            <div className="report-pricing-modal__inner rpm-modal-inner">
              {/* ── Eyebrow ──────────────────────────────────────────────── */}
              <div className="rpm-eyebrow">
                <span
                  className="rpm-eyebrow__dot"
                  style={{ background: "#1f8a5b" }}
                  aria-hidden="true"
                />
                Assessment complete
              </div>

              {/* ── Heading ──────────────────────────────────────────────── */}
              <h2 id="scroll-teaser-title" className="rpm-heading">
                <span style={gradientTextStyle}>{displayName}</span>
                {", your results are in — and they "}
                <em style={gradientTextStyle}>go deeper</em>
                {" than you’d expect."}
              </h2>

              {/* ── Pricing hero ─────────────────────────────────────────── */}
              <div className="rpm-hero-swap">
                <div className="rpm-pcard">
                  <div className="rpm-pcard__taghead">
                    <span className="rpm-pcard__tag">Full personal report</span>
                  </div>

                  <div className="rpm-pcard__body">
                    <h3 className="rpm-pcard__title">
                      Unlock your <em style={gradientTextStyle}>full personal report</em> now
                    </h3>

                    {/* Offer + countdown + price (one bordered box, Figma 7928:31647) */}
                    <div className="rpm-pcard__deal">
                      {offerPillText && (
                        <span className="rpm-pcard__offer-pill">
                          <GreenCheck size={13} color="#ffffff" />
                          {offerPillText}
                        </span>
                      )}
                      <PaywallCountdownTiles mm={mm} ss={ss} />
                      <div className="rpm-pcard__pricerow">
                        <div className="rpm-pcard__pricecol">
                          {strikePriceLabel && (
                            <span className="rpm-pcard__strike">{strikePriceLabel}</span>
                          )}
                          <span className="rpm-pcard__price" style={gradientTextStyle}>
                            {priceLabel}
                          </span>
                        </div>
                        <div className="rpm-pcard__priceaside">
                          {saveLabel && (
                            <span className="rpm-pcard__save">
                              <GreenCheck size={15} />
                              You save {saveLabel}
                            </span>
                          )}
                          <span className="rpm-pcard__once">One time payment</span>
                        </div>
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="rpm-pcard__features">
                      {(
                        [
                          { lead: "+50 pages", tail: " of deep insights into your sexuality" },
                          { lead: "Results based on +100 science papers", tail: "" },
                          {
                            lead: "30+ chapters",
                            tail: " on your sexual fantasies, arousal & desire patterns",
                          },
                          {
                            lead: "Personalised growth paths",
                            tail: " & suggestions to improve your sex life",
                          },
                          { lead: "Share your report", tail: " with up to 2 extra emails" },
                        ] as Array<{ lead: string; tail: string }>
                      ).map(({ lead, tail }) => (
                        <li key={lead}>
                          <GreenCheck size={18} />
                          <span>
                            <span style={{ fontWeight: 700, color: "#161021" }}>{lead}</span>
                            <span style={{ fontWeight: 400, color: "#3f3a4d" }}>{tail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button type="button" className="rpm-cta rpm-cta--pay" onClick={handleCtaClick}>
                      <span className="rpm-cta__wash" aria-hidden="true" />
                      <span className="rpm-cta__reveal" aria-hidden="true" />
                      <span className="rpm-cta__label">Continue to payment</span>
                      <svg
                        className="rpm-cta__arrow"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 12h14M13 6l6 6-6 6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    <p className="rpm-pcard__fineprint">
                      14-day money-back guarantee · secure checkout
                    </p>

                    <div className="rpm-pcard__payments">
                      <span className="rpm-pcard__payments-label">Our payment methods</span>
                      <div className="rpm-pcard__payments-row">
                        {PAYMENT_METHODS.map((m) => (
                          <span
                            key={m.key}
                            className={`report-pricing-modal__payment-logo report-pricing-modal__payment-logo--${m.key}`}
                            role="img"
                            aria-label={m.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Why unlock the Full Report? (2×2) ────────────────────── */}
              <section className="rpm-why">
                <h3 className="rpm-section-h">
                  Why unlock <em style={gradientTextStyle}>Reports</em>?
                </h3>

                <div
                  className="rpm-why-grid"
                  ref={whyTrackRef}
                  onScroll={() => {
                    const track = whyTrackRef.current;
                    if (!track) return;
                    const first = track.children[0] as HTMLElement | undefined;
                    if (!first) return;
                    const cardW = first.offsetWidth + 16;
                    const page = Math.round(track.scrollLeft / cardW);
                    setWhyPage(Math.max(0, Math.min(page, WHY_PAGES - 1)));
                  }}
                >
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
                          {priceLed && quote ? `${priceLabel}, ${body}` : body}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="rpm-why-nav">
                  <button
                    type="button"
                    aria-label="Previous"
                    className="rpm-cnav-btn"
                    disabled={whyPage === 0}
                    onClick={() => scrollWhyToPage(Math.max(0, whyPage - 1))}
                    style={{ opacity: whyPage === 0 ? 0.35 : 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M10 12 6 8l4-4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <div className="rpm-dots">
                    {Array.from({ length: WHY_PAGES }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Go to card ${i + 1}`}
                        className={`rpm-dot${whyPage === i ? " is-active" : ""}`}
                        onClick={() => scrollWhyToPage(i)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label="Next"
                    className="rpm-cnav-btn"
                    disabled={whyPage === WHY_PAGES - 1}
                    onClick={() => scrollWhyToPage(Math.min(WHY_PAGES - 1, whyPage + 1))}
                    style={{ opacity: whyPage === WHY_PAGES - 1 ? 0.35 : 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M6 12l4-4-4-4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </section>

              {/* ── Here's what you'll learn (carousel) ──────────────────── */}
              <section className="rpm-learn">
                <div className="rpm-learn__head">
                  <div className="rpm-eyebrow">
                    <span
                      className="rpm-eyebrow__dot"
                      style={{ background: "#8b5cf6" }}
                      aria-hidden="true"
                    />
                    A preview of what&rsquo;s inside
                  </div>
                  <h3 className="rpm-section-h">
                    Here&rsquo;s what you&rsquo;ll learn
                    <br />
                    <em style={gradientTextStyle}>and why it matters</em>
                  </h3>
                </div>

                <div
                  className="rpm-learn-track"
                  ref={chapterTrackRef}
                  data-lenis-prevent
                  onScroll={() => {
                    const track = chapterTrackRef.current;
                    if (!track) return;
                    const first = track.children[0] as HTMLElement | undefined;
                    if (!first) return;
                    const cardW = first.offsetWidth + 18;
                    const page = Math.round(track.scrollLeft / cardW);
                    setChapterPage(Math.max(0, Math.min(page, CHAPTER_PAGES - 1)));
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChapterDragStart(e.clientX, e.clientY);
                  }}
                  onMouseMove={(e) => onChapterDragMove(e.clientX, e.clientY)}
                  onMouseUp={onChapterDragEnd}
                  onMouseLeave={onChapterDragEnd}
                  onTouchStart={(e) =>
                    onChapterDragStart(e.touches[0]!.clientX, e.touches[0]!.clientY)
                  }
                  onTouchMove={(e) =>
                    onChapterDragMove(e.touches[0]!.clientX, e.touches[0]!.clientY, e)
                  }
                  onTouchEnd={onChapterDragEnd}
                  onTouchCancel={onChapterDragEnd}
                >
                  {CHAPTER_CARDS.map(({ num, topic, why }) => (
                    <article key={num} className="rpm-learn-card">
                      <span className="rpm-learn-card__num">{num}</span>
                      <span className="rpm-learn-card__label">What you learn</span>
                      <h4 className="rpm-learn-card__topic">{topic}</h4>
                      <span className="rpm-learn-card__label rpm-learn-card__label--muted">
                        Why it matters
                      </span>
                      <p className="rpm-learn-card__why">{why}</p>
                      <span className="rpm-learn-card__lock">
                        <LockGlyph />
                        Locked · in your report
                      </span>
                    </article>
                  ))}
                </div>

                <div className="rpm-learn-nav">
                  <button
                    type="button"
                    aria-label="Previous"
                    className="rpm-cnav-btn"
                    disabled={chapterPage === 0}
                    onClick={() => scrollChapterToPage(Math.max(0, chapterPage - 1))}
                    style={{ opacity: chapterPage === 0 ? 0.35 : 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M10 12 6 8l4-4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <div className="rpm-dots">
                    {Array.from({ length: CHAPTER_PAGES }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Go to chapter ${i + 1}`}
                        className={`rpm-dot${chapterPage === i ? " is-active" : ""}`}
                        onClick={() => scrollChapterToPage(i)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label="Next"
                    className="rpm-cnav-btn"
                    disabled={chapterPage === CHAPTER_PAGES - 1}
                    onClick={() =>
                      scrollChapterToPage(Math.min(CHAPTER_PAGES - 1, chapterPage + 1))
                    }
                    style={{ opacity: chapterPage === CHAPTER_PAGES - 1 ? 0.35 : 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M6 12l4-4-4-4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </section>

              <PaywallTestimonials open={open} />
            </div>
          </div>

          {/* ── Sticky bottom bar ──────────────────────────────────────── */}
          <div className="rpm-sticky">
            <div className="rpm-sticky__inner">
              <div className="rpm-sticky__copy">
                <span className="rpm-sticky__lead">Ready to know yourself?</span>
                <span className="rpm-sticky__sub">14-day money-back</span>
              </div>
              <div className="rpm-sticky__actions">
                <PaywallCountdownPill mm={mm} ss={ss} />
                <button type="button" className="rpm-cta rpm-cta--sticky" onClick={handleStickyCta}>
                  <span className="rpm-cta__wash" aria-hidden="true" />
                  <span className="rpm-cta__reveal" aria-hidden="true" />
                  <span className="rpm-cta__label">Unlock full report</span>
                  <svg
                    className="rpm-cta__arrow"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ScrollPricingModal;
