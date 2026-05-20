"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FC, type TouchEvent as ReactTouchEvent } from "react";
import type { ReportTheme } from "./reportTheme";
import type { ReportPriceQuoteSnapshot } from "@/lib/pricing/reportPricing";
import {
  formatReportPurchasePrice,
  getReportPurchaseBadgeFromPrice,
  getReportPurchaseStrikePrice,
} from "@/lib/checkout/reportPurchase";
import { trackBeginCheckout, trackPaywallView, trackPriceShown } from "@/lib/analytics";
import PricingTestimonialsCarousel from "./PricingTestimonialsCarousel";

interface Props {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
  archetype: string;
  userName: string | null;
  theme: ReportTheme;
  matchScore: number;
  quote: ReportPriceQuoteSnapshot | null;
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

// ─── Small helpers ────────────────────────────────────────────────────────────

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="7" stroke="#ff6a3d" strokeWidth="1.5" />
      <path
        d="M5 8l2.5 2.5L11 5.5"
        stroke="#ff6a3d"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true">
      <rect x="1" y="6" width="10" height="8" rx="2" stroke="#9ca3af" strokeWidth="1.5" />
      <path d="M4 6V4a2 2 0 0 1 4 0v2" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PaymentLogo({ logo, label }: { logo: string; label: string }) {
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

function SegmentBar({
  segments,
  value,
  label,
}: {
  segments: 1 | 2 | 3;
  value: string;
  label: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "14px", color: "#fff", fontFamily: "var(--font-sans)" }}>
          {label}
        </span>
        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>{value}</span>
      </div>
      <div style={{ display: "flex", gap: "3px" }}>
        {([1, 2, 3] as const).map((n) => (
          <div
            key={n}
            style={{
              flex: 1,
              height: "5px",
              borderRadius: "9999px",
              background: n <= segments ? "#ff6a3d" : "rgba(255,255,255,0.12)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Why Unlock cards ─────────────────────────────────────────────────────────

const WHY_CARDS = [
  {
    badge: "RISK FREE",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5Z"
          stroke="#34d399"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9 12l2 2 4-4"
          stroke="#34d399"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: "14-day money-back guarantee.",
    subtitle: "Zero risk.",
    body: "Read the full report. If it doesn't land, every cent back, no questions.",
    accentRgb: "52,211,153",
    showPrice: false,
  },
  {
    badge: "DEEP CLARITY",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="#a78bfa" strokeWidth="1.5" />
        <path d="M12 8v4M12 16h.01" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "Understand one of life’s most important areas:",
    subtitle: "sexuality, desire, love, and intimacy.",
    body: "Most of us were never taught any of this. Your report finally puts language to it.",
    accentRgb: "167,139,250",
    showPrice: false,
  },
  {
    badge: "BREAK PATTERNS",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" stroke="#fe6839" strokeWidth="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1" stroke="#fe6839" strokeWidth="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1" stroke="#fe6839" strokeWidth="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1" stroke="#fe6839" strokeWidth="1.5" />
      </svg>
    ),
    title: "Stop repeating old patterns",
    subtitle: "and finally understand what drives them.",
    body: "The same dynamics show up across relationships for a reason. See yours, named.",
    accentRgb: "254,104,57",
    showPrice: false,
  },
  {
    badge: "LIFETIME VALUE",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
          stroke="#2dd4bf"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M14 2v6h6" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M9 13h6M9 17h4" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "For the price of a cocktail or movie ticket,",
    subtitle: "get insights that can change how you communicate, connect, and desire.",
    body: "one time. Yours forever — re-read it, share it, return to it.",
    accentRgb: "45,212,191",
    showPrice: true,
  },
];

// ─── Chapter preview cards ────────────────────────────────────────────────────

const CHAPTER_CARDS = [
  {
    num: "01.",
    topic: "Your core archetype",
    why: "Understand the main pattern shaping your sexuality, attraction, emotional needs, and relationship behaviour.",
    free: true,
  },
  {
    num: "02.",
    topic: "Other archetype influences",
    why: "See the secondary patterns that add nuance, tension, or hidden layers to your personality.",
    free: true,
  },
  {
    num: "03.",
    topic: "Your core motivation",
    why: "Learn what you are truly seeking underneath desire — safety, intensity, freedom, or depth.",
    free: false,
  },
  {
    num: "04.",
    topic: "Your attachment style",
    why: "See the secondary patterns that add nuance, tension, or hidden layers to your personality.",
    free: false,
  },
  {
    num: "05.",
    topic: "The importance of sexuality",
    why: "See how central sex is to your aliveness and well-being right now — and why “more” or “less” isn’t better, only mismatched.",
    free: false,
  },
];

// ─── Main component ───────────────────────────────────────────────────────────

const ScrollPricingModal: FC<Props> = ({
  open,
  onClose,
  onCheckout,
  archetype,
  userName,
  theme,
  matchScore,
  quote,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const scrollLockRef = useRef<ScrollLockState | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const didOpenRef = useRef(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [focusMode, setFocusMode] = useState<"keyboard" | "pointer">("pointer");
  const paywallViewFiredRef = useRef(false);
  const priceShownFiredRef = useRef(false);

  // ── Analytics ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      paywallViewFiredRef.current = false;
      priceShownFiredRef.current = false;
      return;
    }
    if (paywallViewFiredRef.current || !quote) return;
    paywallViewFiredRef.current = true;
    trackPaywallView([
      { plan: "full_report", price: quote.currentPriceCents / 100, currency: quote.currency },
    ]);
  }, [open, quote]);

  useEffect(() => {
    if (!open || priceShownFiredRef.current || !quote) return;
    priceShownFiredRef.current = true;
    trackPriceShown({
      plan: "full_report",
      price: quote.currentPriceCents / 100,
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
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;
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
      if (lock) window.scrollTo(0, lock.scrollY);
      scrollLockRef.current = null;
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [onClose, open]);

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

  const currentCents = quote?.currentPriceCents ?? 0;
  const msrpCents = quote?.msrpCents ?? null;
  const strikeEligible = typeof msrpCents === "number" && msrpCents > currentCents;
  const strikePriceLabel = strikeEligible ? getReportPurchaseStrikePrice(msrpCents) : null;
  const priceLabel = quote ? formatReportPurchasePrice(currentCents) : "—";
  const badge = quote
    ? getReportPurchaseBadgeFromPrice({ strikeCents: msrpCents, currentCents })
    : null;

  const displayName = userName ?? "Friend";
  const matchPct = Math.min(100, Math.round(matchScore));

  const handleCtaClick = () => {
    if (quote) {
      trackBeginCheckout("full_report", quote.currentPriceCents / 100, quote.currency);
    }
    onCheckout();
  };

  // ── Chapter carousel ────────────────────────────────────────────────────────
  const chapterTrackRef = useRef<HTMLDivElement>(null);
  const [chapterPage, setChapterPage] = useState(0);
  const CHAPTER_PAGES = 3; // 6 cards, ~2 per screen
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
    const card = track.children[page * 2] as HTMLElement | undefined;
    if (!card) return;
    track.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
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

  const onChapterDragMove = (clientX: number, clientY: number, e?: React.TouchEvent) => {
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

  return (
    <div
      className={`report-pricing-modal ${open ? "is-visible" : "is-hidden"}`}
      data-state={open ? "open" : "closed"}
      data-focus-mode={focusMode}
      aria-hidden={!open}
    >
      <div className="report-pricing-modal__backdrop" aria-hidden="true" onClick={onClose} />
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
          <button
            type="button"
            className="report-pricing-modal__close"
            aria-label="Close"
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
            onTouchCancel={resetTouch}
            onTouchEnd={resetTouch}
            onTouchMove={handleTouchMove}
            onTouchStart={handleTouchStart}
          >
            <div className="report-pricing-modal__inner" style={{ padding: "40px 32px 64px" }}>
              {/* ── Badge ───────────────────────────────────────────────── */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "32px" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 18px",
                    borderRadius: "9999px",
                    border: "1px solid rgba(58,37,89,0.6)",
                    background: "rgba(21,10,34,0.6)",
                    boxShadow: "0 0 20px 0 rgba(167,139,250,0.1)",
                    color: "#a78bfa",
                    fontSize: "13px",
                    fontWeight: 500,
                    letterSpacing: "1.2px",
                    textTransform: "uppercase",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M13.5 4.5L6.5 11.5L3 8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Assessment Complete
                </div>
              </div>

              {/* ── Heading ─────────────────────────────────────────────── */}
              <h2
                id="scroll-teaser-title"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "clamp(24px, 3.5vw, 48px)",
                  fontWeight: 400,
                  lineHeight: 1.1,
                  letterSpacing: "-0.025em",
                  textAlign: "center",
                  marginBottom: "40px",
                  color: "#fff",
                }}
              >
                <span style={{ color: "#a78bfa" }}>{displayName}</span>
                {", you score highest with the following Archetype:"}
              </h2>

              {/* ── Two-column: Archetype card + Pricing card ────────────── */}
              <div
                style={{
                  display: "flex",
                  gap: "clamp(16px, 3vw, 40px)",
                  marginBottom: "40px",
                  alignItems: "stretch",
                  flexWrap: "wrap",
                }}
              >
                {/* LEFT: Core Archetype Card */}
                <div
                  style={{
                    flex: "1 1 280px",
                    position: "relative",
                    border: "1px solid #fe6839",
                    background: "#130b17",
                    borderRadius: "18px",
                    padding: "28px",
                    overflow: "hidden",
                  }}
                >
                  {/* Decorative blur */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: "-80px",
                      right: "-60px",
                      width: "240px",
                      height: "240px",
                      borderRadius: "50%",
                      background: "rgba(167,139,250,0.12)",
                      filter: "blur(40px)",
                      pointerEvents: "none",
                    }}
                  />

                  {/* Header row: tag left, match strength right */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                      marginBottom: "16px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 14px",
                        borderRadius: "9999px",
                        border: "0.75px solid rgba(255,106,61,0.2)",
                        background: "rgba(255,106,61,0.1)",
                        color: "#ff6a3d",
                        fontSize: "13px",
                        fontWeight: 500,
                      }}
                    >
                      Your Core Archetype
                    </div>

                    {/* Match Strength (top-right of card) */}
                    <div style={{ textAlign: "right", minWidth: "120px" }}>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "rgba(255,255,255,0.5)",
                          marginBottom: "4px",
                          fontWeight: 500,
                        }}
                      >
                        Match Strength
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontSize: "clamp(22px, 3vw, 32px)",
                          fontWeight: 700,
                          color: "#fff",
                          lineHeight: 1,
                          marginBottom: "6px",
                        }}
                      >
                        {matchPct}%
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "8px",
                          borderRadius: "9999px",
                          background: "rgba(255,255,255,0.1)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${matchPct}%`,
                            borderRadius: "9999px",
                            background: "linear-gradient(to right, #fe6839, #a78bfa, #e9d5ff)",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Archetype name */}
                  <div
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: "clamp(28px, 4vw, 44px)",
                      fontWeight: 500,
                      color: "#fff",
                      lineHeight: 1.05,
                      marginBottom: "8px",
                    }}
                  >
                    {archetype}
                  </div>

                  {/* Motto */}
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#d1d5db",
                      lineHeight: 1.5,
                      marginBottom: "20px",
                    }}
                  >
                    {theme.motto}
                  </div>

                  {/* Behavioral tendencies (bordered container) */}
                  <div
                    style={{
                      border: "0.75px solid rgba(255,106,61,0.4)",
                      borderRadius: "12px",
                      padding: "16px",
                      marginBottom: "20px",
                    }}
                  >
                    {/* Core motivation */}
                    <div style={{ marginBottom: "14px" }}>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "rgba(255,255,255,0.4)",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          marginBottom: "6px",
                        }}
                      >
                        Core motivation
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "5px 12px",
                          borderRadius: "9999px",
                          border: "1px solid rgba(255,106,61,0.25)",
                          background: "rgba(255,106,61,0.08)",
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: "#ff6a3d",
                            display: "inline-block",
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "15px",
                            color: "#fff",
                          }}
                        >
                          {theme.motivation}
                        </span>
                      </div>
                    </div>

                    {/* 2×2 traits grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px 16px",
                      }}
                    >
                      {(
                        [
                          { label: "Communication", value: theme.communication },
                          { label: "Initiation", value: theme.initiation },
                          { label: "Attachment", value: theme.attachment },
                          { label: "Power orientation", value: theme.powerOrientation },
                        ] as const
                      ).map(({ label, value }) => (
                        <div key={label}>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "rgba(255,255,255,0.45)",
                              marginBottom: "2px",
                            }}
                          >
                            {label}
                          </div>
                          <div
                            style={{
                              fontFamily: "var(--font-serif)",
                              fontSize: "clamp(14px, 2vw, 18px)",
                              fontWeight: 500,
                              color: "#fff",
                            }}
                          >
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Risk + confidence bars */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <SegmentBar
                      label="Risk orientation"
                      segments={theme.riskSegments}
                      value={theme.riskOrientation}
                    />
                    <SegmentBar
                      label="Typical confidence"
                      segments={theme.confidenceSegments}
                      value={theme.confidence}
                    />
                  </div>
                </div>

                {/* RIGHT: Pricing CTA Card */}
                <div
                  style={{
                    flex: "1 1 280px",
                    position: "relative",
                    border: "1px solid rgba(85,101,247,0.68)",
                    background: "rgba(85,101,247,0.1)",
                    backdropFilter: "blur(12px)",
                    borderRadius: "18px",
                    padding: "40px 28px 28px",
                    overflow: "hidden",
                  }}
                >
                  {/* Decorative blur */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: "-60px",
                      left: "-60px",
                      width: "250px",
                      height: "250px",
                      borderRadius: "50%",
                      background: "rgba(167,139,250,0.1)",
                      filter: "blur(50px)",
                      pointerEvents: "none",
                    }}
                  />

                  {/* Floating badges */}
                  {badge && (
                    <div
                      style={{
                        position: "absolute",
                        top: "-16px",
                        left: "24px",
                        padding: "5px 14px",
                        borderRadius: "9999px",
                        background: "rgba(0,201,80,0.15)",
                        border: "1px solid rgba(0,201,80,0.35)",
                        color: "#00c950",
                        fontSize: "13px",
                        fontWeight: 500,
                      }}
                    >
                      {badge}
                    </div>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      top: "-16px",
                      right: "24px",
                      padding: "5px 14px",
                      borderRadius: "9999px",
                      background: "#fe6839",
                      color: "#fff",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    Most popular
                  </div>

                  {/* Headline */}
                  <h3
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: "clamp(20px, 2.8vw, 36px)",
                      fontWeight: 700,
                      color: "#fff",
                      lineHeight: 1.2,
                      marginBottom: "20px",
                    }}
                  >
                    Unlock your <span style={{ color: "#fe6839" }}>FULL</span> personal report now
                  </h3>

                  {/* Pricing */}
                  {strikePriceLabel && (
                    <div
                      style={{
                        fontSize: "clamp(16px, 2vw, 22px)",
                        color: "#6b7280",
                        textDecoration: "line-through",
                        marginBottom: "4px",
                      }}
                    >
                      {strikePriceLabel} one off
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "8px",
                      marginBottom: "20px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "clamp(36px, 5vw, 64px)",
                        fontWeight: 700,
                        color: "#fff",
                        lineHeight: 1,
                      }}
                    >
                      {priceLabel}
                    </span>
                    <span style={{ fontSize: "clamp(14px, 1.8vw, 20px)", color: "#d1d5db" }}>
                      / one time payment
                    </span>
                  </div>

                  {/* 14-day guarantee row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      marginBottom: "16px",
                      padding: "12px 14px",
                      borderRadius: "10px",
                      background: "rgba(255,106,61,0.07)",
                      border: "1px solid rgba(255,106,61,0.15)",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                      style={{ flexShrink: 0, marginTop: "1px" }}
                    >
                      <circle cx="10" cy="10" r="9" stroke="#ff6a3d" strokeWidth="1.5" />
                      <path
                        d="M6.5 10l2.5 2.5 5-5"
                        stroke="#ff6a3d"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span
                      style={{ fontSize: "14px", color: "#fff", lineHeight: 1.5, fontWeight: 500 }}
                    >
                      14-day money-back guarantee — no discussions
                    </span>
                  </div>

                  {/* Features list */}
                  <ul
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      listStyle: "none",
                      margin: "0 0 24px",
                      padding: 0,
                    }}
                  >
                    {[
                      "+50 pages of deep insights into your sexuality",
                      "Results based on +100 science papers",
                      "30+ chapters on your sexual phantasies, arousal & desire patterns",
                      "Personalized growth paths & suggestions to improve your sexlife",
                      "Share your report with up to 2 extra e-mails",
                    ].map((feat) => (
                      <li
                        key={feat}
                        style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}
                      >
                        <CheckIcon size={16} />
                        <span
                          style={{
                            fontSize: "clamp(13px, 1.5vw, 16px)",
                            color: "#d1d5db",
                            lineHeight: 1.5,
                          }}
                        >
                          {feat}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA button — orange → purple gradient, radius 24px */}
                  <button
                    type="button"
                    onClick={handleCtaClick}
                    style={{
                      width: "100%",
                      padding: "18px 24px",
                      borderRadius: "24px",
                      background: "linear-gradient(to right, #fe6839, #a78bfa)",
                      border: "none",
                      color: "#fff",
                      fontSize: "clamp(15px, 1.8vw, 18px)",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      boxShadow: "0px 4px 20px rgba(254,104,57,0.4)",
                    }}
                  >
                    Unlock full report
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 12h14M13 6l6 6-6 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── Payment methods ──────────────────────────────────────── */}
              <div
                style={{
                  textAlign: "center",
                  marginBottom: "48px",
                  padding: "24px 0 8px",
                }}
              >
                <p
                  style={{
                    fontSize: "14px",
                    color: "#fff",
                    marginBottom: "16px",
                    fontWeight: 400,
                  }}
                >
                  Our payment methods
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <PaymentLogo logo="apple-pay" label="Apple Pay" />
                  <PaymentLogo logo="paypal" label="PayPal" />
                  <PaymentLogo logo="google-pay" label="Google Pay" />
                  <PaymentLogo logo="klarna" label="Klarna" />
                  <PaymentLogo logo="mastercard" label="Mastercard" />
                  <PaymentLogo logo="visa" label="Visa" />
                  <PaymentLogo logo="amex" label="American Express" />
                </div>
              </div>

              {/* ── Testimonials / social proof ──────────────────────────── */}
              <div
                style={{
                  background: "#150a22",
                  borderRadius: "24px",
                  padding: "40px 24px 48px",
                  marginBottom: "40px",
                  textAlign: "center",
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "clamp(24px, 4vw, 50px)",
                    fontWeight: 700,
                    color: "#fff",
                    lineHeight: 1.2,
                    marginBottom: "20px",
                  }}
                >
                  Real <em style={{ color: "#a78bfa", fontStyle: "italic" }}>people</em>. Real{" "}
                  <em style={{ color: "#a78bfa", fontStyle: "italic" }}>insights</em>. Real{" "}
                  <em style={{ color: "#a78bfa", fontStyle: "italic" }}>results</em>.
                </h3>

                {/* Avatar stack + rating */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "12px",
                    marginBottom: "32px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {[
                      "/testimonials/dijana.webp",
                      "/testimonials/marija.webp",
                      "/testimonials/philipp.webp",
                    ].map((src, i) => (
                      <Image
                        key={src}
                        src={src}
                        alt=""
                        aria-hidden="true"
                        width={40}
                        height={40}
                        style={{
                          borderRadius: "50%",
                          border: "2px solid #0a0510",
                          objectFit: "cover",
                          marginLeft: i === 0 ? 0 : "-12px",
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: "16px", color: "#fff", fontWeight: 400 }}>
                    4.9/5 Rating
                  </span>
                </div>

                <PricingTestimonialsCarousel />
              </div>

              {/* ── Why unlock section (2×2 grid) ────────────────────── */}
              <div style={{ marginBottom: "56px" }}>
                <h3
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "clamp(26px, 4vw, 50px)",
                    fontWeight: 700,
                    color: "#fff",
                    textAlign: "center",
                    lineHeight: 1.15,
                    marginBottom: "40px",
                  }}
                >
                  Why unlock the{" "}
                  <em style={{ color: "#a78bfa", fontStyle: "italic" }}>Full Report</em> ?
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    columnGap: "clamp(16px, 3vw, 40px)",
                    rowGap: "clamp(16px, 3vw, 40px)",
                  }}
                >
                  {WHY_CARDS.map(
                    ({ badge: cardBadge, icon, title, subtitle, body, accentRgb, showPrice }) => (
                      <div
                        key={title}
                        style={{
                          position: "relative",
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "clamp(20px, 3vw, 40px)",
                          padding: "clamp(24px, 4vw, 49px)",
                          backdropFilter: "blur(6px)",
                          WebkitBackdropFilter: "blur(6px)",
                          overflow: "hidden",
                        }}
                      >
                        {/* Accent glow orb top-right */}
                        <div
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            right: "-128px",
                            top: "-128px",
                            width: "288px",
                            height: "288px",
                            borderRadius: "50%",
                            background: `rgba(${accentRgb},0.18)`,
                            filter: "blur(40px)",
                            pointerEvents: "none",
                          }}
                        />

                        {/* Icon + badge row */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: "clamp(16px, 3vw, 32px)",
                          }}
                        >
                          <div
                            style={{
                              width: "64px",
                              height: "64px",
                              borderRadius: "20px",
                              background: `linear-gradient(135deg, rgba(${accentRgb},0.2) 0%, rgba(${accentRgb},0.05) 100%)`,
                              border: `1px solid rgba(${accentRgb},0.3)`,
                              boxShadow: `0px 0px 30px -5px rgba(${accentRgb},0.3)`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {icon}
                          </div>
                          <div
                            style={{
                              padding: "9px 17px",
                              borderRadius: "9999px",
                              background: `rgba(${accentRgb},0.1)`,
                              border: `1px solid rgba(${accentRgb},0.2)`,
                              boxShadow: `0px 0px 15px -3px rgba(${accentRgb},0.2)`,
                              color: `rgb(${accentRgb})`,
                              fontSize: "clamp(11px, 1.2vw, 15px)",
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {cardBadge}
                          </div>
                        </div>

                        <div
                          style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "clamp(18px, 2.2vw, 32px)",
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.95)",
                            lineHeight: 1.15,
                            letterSpacing: "-0.025em",
                            marginBottom: "8px",
                          }}
                        >
                          {title}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: showPrice
                              ? "clamp(22px, 3vw, 40px)"
                              : "clamp(14px, 1.8vw, 24px)",
                            fontWeight: 400,
                            color: `rgb(${accentRgb})`,
                            marginBottom: "clamp(12px, 2vw, 20px)",
                            lineHeight: 1.2,
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {subtitle}
                        </div>
                        {showPrice && quote && (
                          <p style={{ margin: "0 0 8px" }}>
                            <span
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "clamp(24px, 3vw, 40px)",
                                fontWeight: 500,
                                color: `rgb(${accentRgb})`,
                              }}
                            >
                              {formatReportPurchasePrice(quote.currentPriceCents)}
                            </span>
                            <span
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "clamp(14px, 1.5vw, 20px)",
                                color: "#fff",
                                fontWeight: 400,
                              }}
                            >
                              {" "}
                              {body}
                            </span>
                          </p>
                        )}
                        {!showPrice && (
                          <p
                            style={{
                              fontFamily: "var(--font-sans)",
                              fontSize: "clamp(13px, 1.4vw, 20px)",
                              color: "#fff",
                              lineHeight: 1.5,
                              margin: 0,
                              fontWeight: 400,
                            }}
                          >
                            {body}
                          </p>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* ── Preview of what's inside (carousel) ──────────────── */}
              <div style={{ marginBottom: "40px" }}>
                <div style={{ textAlign: "center", marginBottom: "32px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      marginBottom: "16px",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#fe6839",
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.55)",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                    >
                      A preview of what&rsquo;s inside
                    </span>
                  </div>
                  <h3
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: "clamp(22px, 3.5vw, 44px)",
                      fontWeight: 700,
                      color: "#fff",
                      lineHeight: 1.2,
                      margin: "0 0 4px",
                    }}
                  >
                    Here&rsquo;s what you will learn
                  </h3>
                  <div
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: "clamp(20px, 3vw, 40px)",
                      fontStyle: "italic",
                      fontWeight: 400,
                      color: "#a78bfa",
                      lineHeight: 1.2,
                    }}
                  >
                    and why it matters
                  </div>
                </div>

                {/* Carousel track */}
                <div
                  ref={chapterTrackRef}
                  data-lenis-prevent
                  onScroll={() => {
                    const track = chapterTrackRef.current;
                    if (!track) return;
                    const cardW = 300;
                    const page = Math.round(track.scrollLeft / (cardW * 2));
                    setChapterPage(Math.min(page, CHAPTER_PAGES - 1));
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
                  style={{
                    display: "flex",
                    gap: "20px",
                    overflowX: "auto",
                    paddingBottom: "4px",
                    scrollSnapType: "x mandatory",
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                    cursor: "grab",
                    userSelect: "none",
                  }}
                >
                  {CHAPTER_CARDS.map(({ num, topic, why, free }) => (
                    <div
                      key={num}
                      style={{
                        flex: "0 0 280px",
                        height: "386px",
                        position: "relative",
                        background: "rgba(10,5,16,0.8)",
                        backdropFilter: "blur(6px)",
                        WebkitBackdropFilter: "blur(6px)",
                        border: "1px solid rgba(167,139,250,0.3)",
                        borderRadius: "24px",
                        boxShadow: "0px 0px 15px 0px rgba(192,132,252,0.15)",
                        padding: "25px",
                        scrollSnapAlign: "start",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          right: "-77px",
                          top: "-79px",
                          width: "192px",
                          height: "192px",
                          borderRadius: "50%",
                          background: "rgba(167,139,250,0.36)",
                          filter: "blur(50px)",
                          pointerEvents: "none",
                        }}
                      />
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          right: "172px",
                          top: "262px",
                          width: "192px",
                          height: "192px",
                          borderRadius: "50%",
                          background: "rgba(167,139,250,0.36)",
                          filter: "blur(50px)",
                          pointerEvents: "none",
                        }}
                      />

                      <div
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontSize: "30px",
                          fontWeight: 300,
                          color: "#fff",
                          lineHeight: "36px",
                          letterSpacing: "-0.75px",
                        }}
                      >
                        {num}
                      </div>

                      <div
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "#fe6839",
                          letterSpacing: "1.8px",
                          textTransform: "uppercase",
                          paddingTop: "8px",
                          marginBottom: "6px",
                        }}
                      >
                        What you learn
                      </div>

                      <div
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontSize: "24px",
                          fontWeight: 200,
                          color: "rgba(255,255,255,0.9)",
                          lineHeight: "30px",
                          letterSpacing: "-0.6px",
                          paddingBottom: "20px",
                        }}
                      >
                        {topic}
                      </div>

                      <div
                        style={{
                          height: "1px",
                          background: "rgba(167,139,250,0.4)",
                          marginBottom: "20px",
                          width: "39px",
                        }}
                      />

                      <div
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "#fe6839",
                          letterSpacing: "1.8px",
                          textTransform: "uppercase",
                          marginBottom: "8px",
                        }}
                      >
                        Why it matters
                      </div>

                      <p
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "#fff",
                          lineHeight: 1.5,
                          margin: "0 0 24px",
                          flex: 1,
                        }}
                      >
                        {why}
                      </p>

                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "8px 16px",
                          borderRadius: "9999px",
                          background: free ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.1)",
                          border: `1px solid ${free ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.08)"}`,
                          alignSelf: "flex-start",
                        }}
                      >
                        {free ? (
                          <>
                            <svg
                              width="8"
                              height="6"
                              viewBox="0 0 8 6"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M1 3l2 2 4-4"
                                stroke="#6ee7b7"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#6ee7b7",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Already in your free preview
                            </span>
                          </>
                        ) : (
                          <>
                            <LockIcon />
                            <span
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#d1d5db",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Locked · in your full report
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* CTA card */}
                  <div
                    style={{
                      flex: "0 0 280px",
                      height: "386px",
                      position: "relative",
                      background: "rgba(10,5,16,0.8)",
                      backdropFilter: "blur(6px)",
                      WebkitBackdropFilter: "blur(6px)",
                      border: "1px solid rgba(167,139,250,0.5)",
                      borderRadius: "24px",
                      boxShadow: "0px 0px 20px 0px rgba(192,132,252,0.2)",
                      padding: "25px",
                      scrollSnapAlign: "start",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgba(255,255,255,0.6)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <div
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#fe6839",
                        letterSpacing: "1.8px",
                        textTransform: "uppercase",
                      }}
                    >
                      Life-time access
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: "24px",
                        fontWeight: 200,
                        color: "#fff",
                        lineHeight: 1.25,
                        letterSpacing: "-0.6px",
                      }}
                    >
                      Unlock all chapters
                    </div>
                    <p
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "14px",
                        color: "#fff",
                        lineHeight: 1.5,
                        margin: 0,
                        flex: 1,
                      }}
                    >
                      Curious about your core motivations, and attachment style? Unlock your full
                      report to reveal every hidden layer of your intimacy.
                    </p>
                    <button
                      type="button"
                      onClick={handleCtaClick}
                      style={{
                        width: "100%",
                        padding: "8px 32px",
                        borderRadius: "9999px",
                        background: "#ff6a3d",
                        border: "1px solid rgba(255,255,255,0.4)",
                        color: "#fff",
                        fontFamily: "var(--font-sans)",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        filter: "drop-shadow(0px 3px 12px #ff6a3d)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      Unlock full report
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 12h14M13 6l6 6-6 6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Carousel navigation */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    marginTop: "24px",
                  }}
                >
                  <button
                    type="button"
                    aria-label="Previous"
                    onClick={() => scrollChapterToPage(Math.max(0, chapterPage - 1))}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: chapterPage === 0 ? "default" : "pointer",
                      opacity: chapterPage === 0 ? 0.35 : 1,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M10 12L6 8L10 4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {Array.from({ length: CHAPTER_PAGES }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Go to page ${i + 1}`}
                        onClick={() => scrollChapterToPage(i)}
                        style={{
                          width: chapterPage === i ? "20px" : "8px",
                          height: "8px",
                          borderRadius: "9999px",
                          background: chapterPage === i ? "#a78bfa" : "rgba(255,255,255,0.25)",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          transition: "width 0.25s ease, background 0.25s ease",
                        }}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    aria-label="Next"
                    onClick={() =>
                      scrollChapterToPage(Math.min(CHAPTER_PAGES - 1, chapterPage + 1))
                    }
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: chapterPage === CHAPTER_PAGES - 1 ? "default" : "pointer",
                      opacity: chapterPage === CHAPTER_PAGES - 1 ? 0.35 : 1,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M6 12L10 8L6 4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── Final CTA section ─────────────────────────────────── */}
              <div
                style={{
                  background: "#150a22",
                  borderRadius: "24px",
                  boxShadow: "0px 4px 100px -15px #a78bfa",
                  padding: "40px 32px 48px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  gap: "12px",
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "40px",
                    fontWeight: 700,
                    color: "#fff",
                    textAlign: "center",
                    margin: 0,
                    lineHeight: 1.1,
                  }}
                >
                  Ready to dive deep?
                </h3>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    alignItems: "center",
                    textAlign: "center",
                  }}
                >
                  <p style={{ fontFamily: "var(--font-sans)", margin: 0 }}>
                    <span style={{ fontSize: "22px", color: "#a78bfa", fontWeight: 400 }}>32</span>
                    <span style={{ fontSize: "18px", color: "#fff", fontWeight: 400 }}>
                      {" "}
                      chapters.{" "}
                    </span>
                    <span style={{ fontSize: "22px", color: "#a78bfa", fontWeight: 400 }}>~50</span>
                    <span style={{ fontSize: "18px", color: "#fff", fontWeight: 400 }}>
                      {" "}
                      pages.{" "}
                    </span>
                    <span style={{ fontSize: "22px", color: "#a78bfa", fontWeight: 400 }}>
                      {quote ? formatReportPurchasePrice(quote.currentPriceCents) : "€9.99"}
                    </span>
                    <span style={{ fontSize: "18px", color: "#fff", fontWeight: 400 }}>
                      {" "}
                      once, yours forever.
                    </span>
                  </p>
                  <p style={{ fontFamily: "var(--font-sans)", margin: 0 }}>
                    <span style={{ fontSize: "22px", color: "#a78bfa", fontWeight: 400 }}>
                      14-day money-back
                    </span>
                    <span style={{ fontSize: "18px", color: "#fff", fontWeight: 400 }}>
                      {" "}
                      if it&rsquo;s not for you.
                    </span>
                  </p>
                </div>

                <div style={{ marginTop: "12px", width: "100%", maxWidth: "400px" }}>
                  <button
                    type="button"
                    onClick={handleCtaClick}
                    style={{
                      width: "100%",
                      padding: "16px 32px",
                      borderRadius: "9999px",
                      background: "#ff6a3d",
                      border: "1px solid rgba(255,255,255,0.4)",
                      color: "#fff",
                      fontFamily: "var(--font-sans)",
                      fontSize: "20px",
                      fontWeight: 700,
                      cursor: "pointer",
                      filter: "drop-shadow(0px 3px 12.65px #ff6a3d)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "12px",
                    }}
                  >
                    Unlock full report
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 12h14M13 6l6 6-6 6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScrollPricingModal;
