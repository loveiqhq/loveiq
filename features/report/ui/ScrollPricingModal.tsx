"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { TraitIcons, type ReportTheme } from "./reportTheme";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import {
  formatReportPurchasePrice,
  getReportPurchaseBadgeFromPrice,
  getReportPurchaseStrikePrice,
} from "@features/checkout/server/reportPurchase";
import {
  trackBeginCheckout,
  trackExperimentCardFlipped,
  trackPriceShown,
  trackScrollPaywallDismissed,
  trackScrollPaywallShown,
  type PaywallDismissSource,
} from "@features/analytics/client";
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
  /**
   * When false, the modal cannot be dismissed: the close button is hidden and
   * Escape / backdrop clicks are ignored. The only way forward is checkout.
   * Used by the coupled paywall experiment's "treatment" arm. Defaults to true.
   */
  dismissible?: boolean;
  /**
   * When true, the two hero cards become a single centered flip card —
   * archetype on the front, pricing on the back — tap/click to flip. Used by
   * the coupled paywall experiment's "treatment" arm. Defaults to false
   * (control keeps the side-by-side layout).
   */
  flipDeck?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Measure flip-face heights before paint on the client (no flash); fall back to
// useEffect on the server where layout effects don't run.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
      <path
        d="M0.5 8C0.5 12.1394 3.86064 15.5 8 15.5C12.1394 15.5 15.5 12.1394 15.5 8C15.5 3.86064 12.1394 0.5 8 0.5C3.86064 0.5 0.5 3.86064 0.5 8Z"
        stroke="#00C950"
      />
      <path
        d="M4.41 8L6.46 10.05L11.59 4.93"
        stroke="#00C950"
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
  color,
}: {
  segments: 1 | 2 | 3;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--rpm-bar-label)",
            fontWeight: 400,
            color: "#fff",
            lineHeight: 1,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "var(--rpm-bar-label)",
            fontWeight: 500,
            color: "#fff",
            lineHeight: 1,
          }}
        >
          {value}
        </span>
      </div>
      <div style={{ display: "flex", gap: "4px" }}>
        {([1, 2, 3] as const).map((n) => (
          <div
            key={n}
            style={{
              flex: 1,
              height: "6px",
              borderRadius: "9999px",
              background: n <= segments ? color : "rgba(255,255,255,0.12)",
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
        <path
          d="M2 12C2 17.5192 6.48085 22 12 22C17.5192 22 22 17.5192 22 12C22 6.48085 17.5192 2 12 2C6.48085 2 2 6.48085 2 12V12"
          stroke="#A78BFA"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16.24 7.75977L14.436 13.1708C14.2369 13.768 13.7683 14.2367 13.171 14.4358L7.76001 16.2398L9.56401 10.8288C9.76307 10.2315 10.2317 9.76283 10.829 9.56377L16.24 7.75977"
          stroke="#A78BFA"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
        <path d="M12 3V21" stroke="#FE6839" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3Z"
          stroke="#FE6839"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M3 9H21" stroke="#FE6839" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 15H21" stroke="#FE6839" strokeLinecap="round" strokeLinejoin="round" />
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
          d="M15.8279 14.8291C15.0778 15.579 14.0605 16.0003 12.9999 16.0003C11.9392 16.0003 10.922 15.579 10.1719 14.8291C9.80043 14.4577 9.50578 14.0167 9.30475 13.5314C9.10371 13.0461 9.00024 12.5259 9.00024 12.0006C9.00024 11.4753 9.10371 10.9552 9.30475 10.4698C9.50578 9.98453 9.80043 9.54356 10.1719 9.17212C10.922 8.42224 11.9392 8.00098 12.9999 8.00098C14.0605 8.00098 15.0778 8.42224 15.8279 9.17212"
          stroke="#34D399"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 3.00016C4 2.73494 4.10536 2.48059 4.29289 2.29305C4.48043 2.10552 4.73478 2.00016 5 2.00016C5.24762 1.9988 5.49048 2.06819 5.7 2.20016L6.633 2.80016C6.84204 2.93374 7.08493 3.00472 7.333 3.00472C7.58107 3.00472 7.82396 2.93374 8.033 2.80016L8.967 2.20016C9.17604 2.06658 9.41893 1.99561 9.667 1.99561C9.91507 1.99561 10.158 2.06658 10.367 2.20016L11.3 2.80016C11.509 2.93374 11.7519 3.00472 12 3.00472C12.2481 3.00472 12.491 2.93374 12.7 2.80016L13.633 2.20016C13.842 2.06658 14.0849 1.99561 14.333 1.99561C14.5811 1.99561 14.824 2.06658 15.033 2.20016L15.967 2.80016C16.176 2.93374 16.4189 3.00472 16.667 3.00472C16.9151 3.00472 17.158 2.93374 17.367 2.80016L18.3 2.20016C18.5095 2.06819 18.7524 1.9988 19 2.00016C19.2652 2.00016 19.5196 2.10552 19.7071 2.29305C19.8946 2.48059 20 2.73494 20 3.00016V21.0002C20 21.2654 19.8946 21.5197 19.7071 21.7073C19.5196 21.8948 19.2652 22.0002 19 22.0002C18.7524 22.0015 18.5095 21.9321 18.3 21.8002L17.367 21.2002C17.158 21.0666 16.9151 20.9956 16.667 20.9956C16.4189 20.9956 16.176 21.0666 15.967 21.2002L15.033 21.8002C14.824 21.9337 14.5811 22.0047 14.333 22.0047C14.0849 22.0047 13.842 21.9337 13.633 21.8002L12.7 21.2002C12.491 21.0666 12.2481 20.9956 12 20.9956C11.7519 20.9956 11.509 21.0666 11.3 21.2002L10.367 21.8002C10.158 21.9337 9.91507 22.0047 9.667 22.0047C9.41893 22.0047 9.17604 21.9337 8.967 21.8002L8.033 21.2002C7.82396 21.0666 7.58107 20.9956 7.333 20.9956C7.08493 20.9956 6.84204 21.0666 6.633 21.2002L5.7 21.8002C5.49048 21.9321 5.24762 22.0015 5 22.0002C4.73478 22.0002 4.48043 21.8948 4.29289 21.7073C4.10536 21.5197 4 21.2654 4 21.0002V3.00016Z"
          stroke="#34D399"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 12H13" stroke="#34D399" strokeLinecap="round" strokeLinejoin="round" />
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
  dismissible = true,
  flipDeck = false,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const scrollLockRef = useRef<ScrollLockState | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const didOpenRef = useRef(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [focusMode, setFocusMode] = useState<"keyboard" | "pointer">("pointer");
  const [portalMounted, setPortalMounted] = useState(false);

  // ── Flip-card hero (treatment arm) ───────────────────────────────────────
  // Front = archetype card, back = pricing card. The card nudges every few
  // seconds until the user flips it once, hinting it's interactive.
  const [flipped, setFlipped] = useState(false);
  const [nudging, setNudging] = useState(false);
  const hasFlippedRef = useRef(false);
  const flipCard = useCallback(() => {
    hasFlippedRef.current = true;
    setNudging(false);
    // `flipped` is the current (pre-toggle) face; `to` is the face we flip TO.
    if (flipDeck) {
      trackExperimentCardFlipped({ to: flipped ? "archetype" : "pricing" });
    }
    setFlipped((v) => !v);
  }, [flipDeck, flipped]);

  // Variable-height flip: each face keeps its natural height (front is short,
  // back is taller), and the container animates between them on flip — so the
  // front never gets stretched with empty space.
  const frontFaceRef = useRef<HTMLDivElement>(null);
  const backFaceRef = useRef<HTMLDivElement>(null);
  const [faceHeights, setFaceHeights] = useState<{ front: number; back: number } | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (!flipDeck) return;
    const front = frontFaceRef.current;
    const back = backFaceRef.current;
    if (!front || !back) return;
    const measure = () => {
      const f = front.offsetHeight;
      const b = back.offsetHeight;
      if (f > 0 && b > 0) {
        setFaceHeights((prev) =>
          prev && prev.front === f && prev.back === b ? prev : { front: f, back: b }
        );
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(front);
    ro.observe(back);
    return () => ro.disconnect();
  }, [flipDeck, open, portalMounted, quote, theme, matchScore]);

  // Reset the flip when the modal closes so it always reopens on the front.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync flip state to the open prop
      setFlipped(false);
      hasFlippedRef.current = false;
    }
  }, [open]);

  // Modal-shown impression (both arms). The forced_paywall_arm is auto-stamped
  // by persistAnalyticsEvent (set on report load, before this fires). Re-arms
  // on close so a control re-open is counted again.
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

  // Periodic nudge hint — only while front-facing, before the first flip, and
  // not for reduced-motion users. Stops permanently once the user flips.
  useEffect(() => {
    if (!flipDeck || !open || flipped) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      if (hasFlippedRef.current) return;
      setNudging(true);
      clearTimer = setTimeout(() => setNudging(false), 850);
    }, 3800);
    return () => {
      clearInterval(interval);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [flipDeck, open, flipped]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount flip to enable client-only portal
    setPortalMounted(true);
  }, []);
  const priceShownFiredRef = useRef(false);

  // ── Analytics ──────────────────────────────────────────────────────────────

  // Scroll-paywall dismiss tracking (mirrors ReportPricingModal pattern).
  // openedAtRef captures when the teaser became visible. dismissReasonRef is
  // set by escape/backdrop/close-button paths. checkoutInitiatedRef
  // short-circuits the dismiss event when the user clicked "Unlock".
  //
  // No paywall_view fire here — the scroll teaser auto-opens after a 1s
  // delay on first scroll, which is the founder's "forced" surface. Only
  // user-initiated clicks (lock_click, archetype_unlock, offer_link) count
  // toward paywall_initiated. price_shown still fires because it's a
  // per-quote impression for elasticity analysis, not an intent signal.
  const openedAtRef = useRef(0);
  const dismissReasonRef = useRef<PaywallDismissSource | null>(null);
  const checkoutInitiatedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      priceShownFiredRef.current = false;
      if (openedAtRef.current > 0) {
        // A non-dismissible (forced) modal has no real "dismiss" — if it closes
        // it's because the app swapped to another surface or navigated to
        // checkout, not a user dismiss. Don't pollute the dismiss funnel.
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
    if (!quote) return;
    if (openedAtRef.current === 0) {
      openedAtRef.current = performance.now();
    }
  }, [dismissible, open, quote]);

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
        if (dismissible) {
          dismissReasonRef.current = "escape";
          onClose();
        }
        return;
      }
      if (e.key !== "Tab") return;
      // Exclude elements inside an `inert` subtree (e.g. the hidden flip face) —
      // querySelectorAll does not honor `inert`, so without this the trap could
      // hand focus to the off-screen card's buttons.
      const focusables = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
      ).filter((el) => !el.closest("[inert]"));
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
      if (lock) window.scrollTo(0, lock.scrollY);
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
  const ArchetypeIcon = theme.Icon;

  const handleCtaClick = () => {
    checkoutInitiatedRef.current = true;
    if (quote) {
      trackBeginCheckout("full_report", quote.currentPriceCents / 100, quote.currency);
    }
    onCheckout();
  };

  // ── Why-unlock mobile carousel ─────────────────────────────────────────────
  const whyTrackRef = useRef<HTMLDivElement>(null);
  const [whyPage, setWhyPage] = useState(0);
  const WHY_PAGES = 4; // 4 cards, 1 per screen on mobile

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

  if (!portalMounted) return null;

  return createPortal(
    <div
      className={`report-pricing-modal ${open ? "is-visible" : "is-hidden"}`}
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
              {/* ── Badge (Figma 7128:19051) ────────────────────────────── */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "32px" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "var(--rpm-pill-pad)",
                    borderRadius: "9999px",
                    border: "1px solid rgba(58,37,89,0.6)",
                    background: "rgba(21,10,34,0.6)",
                    boxShadow: "0 0 20px 0 rgba(167,139,250,0.1)",
                    color: "#a78bfa",
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--rpm-pill-text)",
                    fontWeight: 500,
                    lineHeight: 1,
                    letterSpacing: "1.2px",
                    textTransform: "uppercase",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M0.5 8C0.5 12.1394 3.86064 15.5 8 15.5C12.1394 15.5 15.5 12.1394 15.5 8C15.5 3.86064 12.1394 0.5 8 0.5C3.86064 0.5 0.5 3.86064 0.5 8Z"
                      stroke="#00C950"
                      strokeWidth="1"
                    />
                    <path
                      d="M4.41 8L6.46 10.05L11.59 4.93"
                      stroke="#00C950"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Assessment Complete
                </div>
              </div>

              {/* ── Heading (Figma 7128:18573) ──────────────────────────── */}
              <h2
                id="scroll-teaser-title"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "var(--rpm-h1)",
                  fontWeight: 400,
                  lineHeight: "var(--rpm-h1-line)",
                  letterSpacing: "-1.2px",
                  textAlign: "center",
                  marginBottom: "40px",
                  color: "#fff",
                }}
              >
                <span style={{ color: "#a78bfa" }}>{displayName},</span>
                {" you score highest with the following Archetype:"}
              </h2>

              {/* ── Hero: archetype + pricing card. Treatment (flipDeck) turns
                   these into a single centered flip card; control keeps the
                   side-by-side grid. The inner/face wrappers are display:contents
                   no-ops for control (rpm-hero-contents), so its layout is
                   unchanged. ─────────────────────────────────────────────── */}
              <div
                className={flipDeck ? "rpm-flip" : "rpm-hero-grid"}
                style={
                  flipDeck
                    ? undefined
                    : {
                        position: "relative",
                        isolation: "isolate",
                        display: "flex",
                        gap: "clamp(16px, 3vw, 40px)",
                        marginBottom: "40px",
                        alignItems: "stretch",
                        flexWrap: "wrap",
                      }
                }
              >
                <span aria-hidden="true" className="rpm-orb rpm-orb--hero-tl" />
                <span aria-hidden="true" className="rpm-orb rpm-orb--hero-br" />
                <div
                  className={
                    flipDeck
                      ? `rpm-flip__inner${flipped ? " is-flipped" : ""}${nudging ? " is-nudging" : ""}`
                      : "rpm-hero-contents"
                  }
                  style={
                    flipDeck && faceHeights
                      ? { height: flipped ? faceHeights.back : faceHeights.front }
                      : undefined
                  }
                >
                  <div
                    ref={frontFaceRef}
                    className={
                      flipDeck ? "rpm-flip__face rpm-flip__face--front" : "rpm-hero-contents"
                    }
                    role={flipDeck ? "button" : undefined}
                    tabIndex={flipDeck ? (flipped ? -1 : 0) : undefined}
                    aria-label={flipDeck ? "Reveal your offer" : undefined}
                    aria-hidden={flipDeck && flipped ? true : undefined}
                    inert={flipDeck && flipped ? true : undefined}
                    onClick={flipDeck ? flipCard : undefined}
                    onKeyDown={
                      flipDeck
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              flipCard();
                            }
                          }
                        : undefined
                    }
                  >
                    {/* LEFT: Core Archetype Card — Figma 7128:18577 */}
                    <div
                      style={{
                        flex: "1 1 280px",
                        position: "relative",
                        border: `1px solid ${theme.accent}`,
                        background: "#130b17",
                        borderRadius: "18px",
                        padding: "var(--rpm-card-pad)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "26px",
                      }}
                    >
                      {/* Inner clip — keeps the two decorative accent orbs bounded
                      by the card's rounded shape (Figma ellipses 7128:18586/18587). */}
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: "18px",
                          overflow: "hidden",
                          pointerEvents: "none",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: "-80px",
                            right: "-60px",
                            width: "240px",
                            height: "240px",
                            borderRadius: "50%",
                            background: `rgba(${theme.accentRgb} / 0.28)`,
                            filter: "blur(50px)",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            bottom: "-80px",
                            left: "-60px",
                            width: "240px",
                            height: "240px",
                            borderRadius: "50%",
                            background: `rgba(${theme.accentRgb} / 0.28)`,
                            filter: "blur(50px)",
                          }}
                        />
                      </div>

                      {/* Header row: tag left, match strength right */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "20px",
                          flexWrap: "wrap",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "9px 17px",
                            borderRadius: "9999px",
                            border: `0.75px solid rgba(${theme.accentRgb} / 0.2)`,
                            background: `rgba(${theme.accentRgb} / 0.1)`,
                            color: theme.accent,
                            fontFamily: "var(--font-sans)",
                            fontSize: "var(--rpm-card-tag)",
                            fontWeight: 500,
                            lineHeight: 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Your Core Archetype
                        </div>

                        {/* Match Strength (top-right of card) */}
                        <div
                          className="rpm-match-strength"
                          style={{ textAlign: "right", minWidth: "140px", flex: "0 1 auto" }}
                        >
                          <div className="rpm-match-strength__head">
                            <div
                              className="rpm-match-strength__label"
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "var(--rpm-match-label)",
                                color: "rgba(255,255,255,0.5)",
                                marginBottom: "6px",
                                fontWeight: 500,
                                lineHeight: 1,
                              }}
                            >
                              Match Strength
                            </div>
                            <div
                              className="rpm-match-strength__value"
                              style={{
                                fontFamily: "var(--font-serif)",
                                fontSize: "var(--rpm-match-value)",
                                fontWeight: 500,
                                color: "#fff",
                                lineHeight: 1,
                                marginBottom: "8px",
                              }}
                            >
                              {matchPct}%
                            </div>
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
                                background:
                                  "linear-gradient(to right, #fe6839 6.83%, #a78bfa 37.63%, #e9d5ff 100%)",
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Archetype identity row — icon + (name + motto) */}
                      <div
                        style={{
                          display: "flex",
                          gap: "16px",
                          alignItems: "flex-start",
                        }}
                      >
                        {/* Archetype icon (Figma 7022:23082 — 48×48 box on mobile) */}
                        <div
                          aria-hidden="true"
                          style={{
                            flexShrink: 0,
                            width: "var(--rpm-archetype-icon, 64px)",
                            height: "var(--rpm-archetype-icon, 64px)",
                            padding: "calc(var(--rpm-archetype-icon, 64px) * 0.2)",
                            borderRadius: "16px",
                            background: theme.iconBackground,
                            color: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxSizing: "border-box",
                          }}
                        >
                          <ArchetypeIcon
                            width="100%"
                            height="100%"
                            style={{ display: "block", color: "#fff" }}
                          />
                        </div>

                        <div
                          style={{
                            flex: "1 1 auto",
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          {/* Archetype name */}
                          <div
                            style={{
                              fontFamily: "var(--font-serif)",
                              fontSize: "var(--rpm-archetype)",
                              fontWeight: 500,
                              color: "#fff",
                              lineHeight: "var(--rpm-archetype-line)",
                              letterSpacing: "-1px",
                            }}
                          >
                            {archetype}
                          </div>

                          {/* Motto */}
                          <div
                            style={{
                              fontFamily: "var(--font-sans)",
                              fontSize: "var(--rpm-motto)",
                              lineHeight: 1.35,
                              color: "#fff",
                            }}
                          >
                            <span style={{ fontWeight: 300, color: "#d1d5db" }}>Motto: </span>
                            <span style={{ fontWeight: 400 }}>{theme.motto}</span>
                          </div>
                        </div>
                      </div>

                      {/* Behavioral tendencies label */}
                      <div
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: "var(--rpm-behavioral-label)",
                          fontWeight: 400,
                          color: "#fff",
                          lineHeight: 1,
                        }}
                      >
                        Behavioral tendencies:
                      </div>

                      {/* Core motivation — large boxed pill (Figma 7128:18590) */}
                      <div
                        style={{
                          border: `0.75px solid ${theme.accent}`,
                          borderRadius: "12px",
                          padding: "18px",
                          display: "flex",
                          alignItems: "center",
                          gap: "16px",
                        }}
                      >
                        {/* Concentric ring icon */}
                        <span
                          aria-hidden="true"
                          style={{
                            flexShrink: 0,
                            width: "42px",
                            height: "42px",
                            borderRadius: "50%",
                            border: `0.75px solid ${theme.accent}`,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span
                            style={{
                              width: "22px",
                              height: "22px",
                              borderRadius: "50%",
                              border: `0.75px solid ${theme.accent}`,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <span
                              style={{
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                background: theme.accent,
                              }}
                            />
                          </span>
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span
                            style={{
                              fontFamily: "var(--font-sans)",
                              fontSize: "var(--rpm-core-mot-label)",
                              fontWeight: 400,
                              color: theme.accent,
                              lineHeight: 1,
                            }}
                          >
                            Core motivation:
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-serif)",
                              fontSize: "var(--rpm-core-mot-value)",
                              fontWeight: 500,
                              color: "#fff",
                              lineHeight: 1.1,
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
                          columnGap: "32px",
                          rowGap: "32px",
                        }}
                      >
                        {(
                          [
                            {
                              label: "Communication",
                              value: theme.communication,
                              Icon: TraitIcons.communication,
                            },
                            {
                              label: "Initiation",
                              value: theme.initiation,
                              Icon: TraitIcons.initiation,
                            },
                            {
                              label: "Attachment",
                              value: theme.attachment,
                              Icon: TraitIcons.attachment,
                            },
                            {
                              label: "Power orientation",
                              value: theme.powerOrientation,
                              Icon: TraitIcons.powerOrientation,
                            },
                          ] as const
                        ).map(({ label, value, Icon }) => (
                          <div
                            key={label}
                            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span
                                aria-hidden="true"
                                style={{
                                  width: "18px",
                                  height: "18px",
                                  color: theme.accent,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <Icon width={18} height={18} />
                              </span>
                              <span
                                style={{
                                  fontFamily: "var(--font-sans)",
                                  fontSize: "var(--rpm-trait-label)",
                                  fontWeight: 400,
                                  color: "#fff",
                                  lineHeight: 1,
                                }}
                              >
                                {label}
                              </span>
                            </div>
                            <div
                              style={{
                                fontFamily: "var(--font-serif)",
                                fontSize: "var(--rpm-trait-value)",
                                fontWeight: 500,
                                color: "#fff",
                                lineHeight: 1.2,
                              }}
                            >
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Risk + confidence bars */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                        <SegmentBar
                          label="Risk orientation"
                          segments={theme.riskSegments}
                          value={theme.riskOrientation}
                          color={theme.accent}
                        />
                        <SegmentBar
                          label="Typical confidence"
                          segments={theme.confidenceSegments}
                          value={theme.confidence}
                          color={theme.accent}
                        />
                      </div>
                    </div>
                    {flipDeck && !flipped && (
                      <div className="rpm-flip__hint" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path
                            d="M3 12a9 9 0 1 0 3-6.7L3 8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path d="M3 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>Tap to see your offer</span>
                      </div>
                    )}
                  </div>

                  <div
                    ref={backFaceRef}
                    className={
                      flipDeck ? "rpm-flip__face rpm-flip__face--back" : "rpm-hero-contents"
                    }
                    aria-hidden={flipDeck && !flipped ? true : undefined}
                    inert={flipDeck && !flipped ? true : undefined}
                    onClick={
                      flipDeck
                        ? (e) => {
                            // Tapping the card flips back to the archetype, but
                            // clicks on the CTA / flip-back button / links keep
                            // their own behavior (no accidental flip on checkout).
                            if ((e.target as HTMLElement).closest("button, a")) return;
                            flipCard();
                          }
                        : undefined
                    }
                  >
                    {/* RIGHT: Pricing CTA Card — Figma 7128:18653 */}
                    <div
                      className="rpm-pricing-card"
                      style={{
                        flex: "1 1 280px",
                        position: "relative",
                        border: "1px solid rgba(85,101,247,0.68)",
                        // On the flipped face, drop the backdrop blur and use a
                        // near-solid background: backdrop-filter inside a 3D
                        // preserve-3d/backface context corrupts on Safari/iOS.
                        // Inline beats the class rule, so it must be set here.
                        background: flipDeck ? "rgba(40,33,74,0.94)" : "rgba(85,101,247,0.15)",
                        backdropFilter: flipDeck ? "none" : "blur(12px)",
                        WebkitBackdropFilter: flipDeck ? "none" : "blur(12px)",
                        borderRadius: "16px",
                        padding: "49px 33px 41px",
                        boxShadow: "0px 0px 30px 0px rgba(168,85,247,0.1)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "40px",
                      }}
                    >
                      {/* Inner clip — keeps decorative blur inside the rounded card
                      but lets floating badges overflow above the top edge. */}
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: "16px",
                          overflow: "hidden",
                          pointerEvents: "none",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: "-60px",
                            left: "-60px",
                            width: "250px",
                            height: "250px",
                            borderRadius: "50%",
                            background: "rgba(167,139,250,0.1)",
                            filter: "blur(50px)",
                          }}
                        />
                      </div>

                      {/* Floating badges (Figma 7128:18711 + 7128:18713) */}
                      {badge && (
                        <div
                          className="rpm-pricing-badge--discount"
                          style={{
                            position: "absolute",
                            top: flipDeck ? "-16px" : "-21px",
                            // Flip mock places the single discount badge top-right.
                            left: flipDeck ? undefined : "24px",
                            right: flipDeck ? "24px" : undefined,
                            padding: "10px 18px",
                            borderRadius: "9999px",
                            // Flip mock: translucent green + blur, white label.
                            // Control: translucent green on a solid dark base so
                            // the card's top border (the pill straddles it) is masked.
                            background: flipDeck
                              ? "rgba(0, 201, 80, 0.63)"
                              : "linear-gradient(rgba(0,201,80,0.2),rgba(0,201,80,0.2)), #150a22",
                            border: "1px solid rgba(0, 201, 80, 0.3)",
                            backdropFilter: "blur(6px)",
                            WebkitBackdropFilter: "blur(6px)",
                            color: flipDeck ? "#fff" : "#00c950",
                            fontFamily: "var(--font-sans)",
                            fontSize: "var(--rpm-badge)",
                            fontWeight: 500,
                            letterSpacing: "0.3px",
                            lineHeight: 1,
                          }}
                        >
                          {badge}
                        </div>
                      )}
                      {!flipDeck && (
                        <div
                          className="rpm-pricing-badge--popular"
                          style={{
                            position: "absolute",
                            top: "-21px",
                            right: "24px",
                            padding: "10px 18px",
                            borderRadius: "9999px",
                            background: "#fe6839",
                            color: "#fff",
                            fontFamily: "var(--font-sans)",
                            fontSize: "var(--rpm-badge)",
                            fontWeight: 500,
                            letterSpacing: "0.3px",
                            lineHeight: 1,
                          }}
                        >
                          Most popular
                        </div>
                      )}

                      {/* Heading + Price block */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "20px",
                          alignItems: flipDeck ? "center" : undefined,
                          textAlign: flipDeck ? "center" : undefined,
                        }}
                      >
                        {/* Headline (Figma 7128:18656) */}
                        <h3
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "var(--rpm-pricing-h)",
                            fontWeight: 600,
                            color: "#fff",
                            lineHeight: "var(--rpm-pricing-h-line)",
                            margin: 0,
                          }}
                        >
                          {flipDeck ? (
                            <>
                              Unlock your{" "}
                              <span style={{ fontWeight: 700 }}>Full Personal Report</span> now
                            </>
                          ) : (
                            <>
                              Unlock your{" "}
                              <span style={{ color: "#fe6839", fontWeight: 700 }}>FULL</span>{" "}
                              personal report now
                            </>
                          )}
                        </h3>

                        {/* Pricing */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {strikePriceLabel && (
                            <div
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "var(--rpm-price-strike)",
                                fontWeight: 300,
                                color: "#6b7280",
                                textDecoration: "line-through",
                                lineHeight: 1.2,
                              }}
                            >
                              {strikePriceLabel} one off
                            </div>
                          )}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              gap: "4px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "var(--rpm-price)",
                                fontWeight: 500,
                                color: "#fff",
                                lineHeight: 1,
                                letterSpacing: "-0.9px",
                              }}
                            >
                              {priceLabel}
                            </span>
                            <span
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "var(--rpm-price-period)",
                                fontWeight: 300,
                                color: "#fff",
                                lineHeight: 1.2,
                              }}
                            >
                              / one time payment
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Features block */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                        {/* 14-day guarantee row — no container (Figma 7128:18674) */}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                          <svg
                            width="27"
                            height="27"
                            viewBox="0 0 20 20"
                            fill="none"
                            aria-hidden="true"
                            style={{ flexShrink: 0, marginTop: "2px" }}
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
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <span
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "var(--rpm-14day-headline)",
                                fontWeight: 600,
                                color: "#ff6a3d",
                                lineHeight: 1.1,
                              }}
                            >
                              14-day money-back guarantee
                            </span>
                            {/* Flip mock drops the "- no discussions" tail. */}
                            {!flipDeck && (
                              <span
                                style={{
                                  fontFamily: "var(--font-sans)",
                                  fontSize: "var(--rpm-14day-tail)",
                                  fontWeight: 600,
                                  color: "#fff",
                                  lineHeight: 1.2,
                                }}
                              >
                                - no discussions
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Features list */}
                        <ul
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px",
                            listStyle: "none",
                            margin: 0,
                            padding: 0,
                          }}
                        >
                          {(
                            [
                              { lead: "+50 pages", tail: " of deep insights into your sexuality" },
                              { lead: "Results based on +100 science papers", tail: "" },
                              {
                                lead: "30+ chapters",
                                tail: " on your sexual phantasies, arousal & desire patterns",
                              },
                              {
                                lead: "Personalized growth paths",
                                tail: " & suggestions to improve your sexlife",
                              },
                              { lead: "Share your report", tail: " with up to 2 extra e-mails" },
                            ] as const
                          ).map(({ lead, tail }) => (
                            <li
                              key={lead}
                              style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}
                            >
                              <CheckIcon size={16} />
                              <span
                                style={{
                                  fontFamily: "var(--font-sans)",
                                  fontSize: "var(--rpm-feature)",
                                  color: "#fff",
                                  lineHeight: 1.4,
                                }}
                              >
                                <span style={{ fontWeight: 700 }}>{lead}</span>
                                <span style={{ fontWeight: 300 }}>{tail}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* CTA button — solid #ff6a3d pill (Figma 7128:18666) */}
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <button
                          type="button"
                          className="rpm-cta"
                          onClick={handleCtaClick}
                          style={{
                            width: "100%",
                            maxWidth: "460px",
                            padding: flipDeck ? "14px 28px" : "20px 24px",
                            borderRadius: "9999px",
                            background: "#ff6a3d",
                            border: "1px solid rgba(255,255,255,0.4)",
                            color: "#fff",
                            fontFamily: "var(--font-sans)",
                            fontSize: "var(--rpm-cta-label)",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "16px",
                            filter: "drop-shadow(0px 3px 12.65px #ff6a3d)",
                            lineHeight: 1,
                          }}
                        >
                          <span className="rpm-cta__wash" aria-hidden="true" />
                          <span className="rpm-cta__reveal" aria-hidden="true" />
                          <span className="rpm-cta__label">
                            {flipDeck ? "Unlock your full report" : "Unlock full report"}
                          </span>
                          <svg
                            className="rpm-cta__arrow"
                            width="25"
                            height="25"
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
                    {flipDeck && (
                      <button
                        type="button"
                        className="rpm-flip__back"
                        onClick={flipCard}
                        aria-label="View your archetype card"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path
                            d="M3 12a9 9 0 1 0 3-6.7L3 8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path d="M3 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>View your archetype</span>
                      </button>
                    )}
                  </div>
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
                    fontFamily: "var(--font-sans)",
                    fontSize: "16px",
                    fontWeight: 400,
                    lineHeight: "normal",
                    textAlign: "center",
                    color: "#fff",
                    marginBottom: "24px",
                  }}
                >
                  Our payment methods
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    alignItems: "center",
                    columnGap: "28px",
                    rowGap: "16px",
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
                  padding: "40px 0 48px",
                  marginBottom: "40px",
                  textAlign: "center",
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "50px",
                    fontWeight: 700,
                    color: "#fff",
                    lineHeight: "normal",
                    textAlign: "center",
                    marginBottom: "32px",
                  }}
                >
                  <span className="rpm-real-line">
                    Real{" "}
                    <em style={{ color: "#a78bfa", fontStyle: "italic", fontWeight: 700 }}>
                      people
                    </em>
                    .
                  </span>{" "}
                  <span className="rpm-real-line">
                    Real{" "}
                    <em style={{ color: "#a78bfa", fontStyle: "italic", fontWeight: 700 }}>
                      insights
                    </em>
                    .
                  </span>{" "}
                  <span className="rpm-real-line">
                    Real{" "}
                    <em style={{ color: "#a78bfa", fontStyle: "italic", fontWeight: 700 }}>
                      results
                    </em>
                    .
                  </span>
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
                      "/testimonials/rating-1.jpg",
                      "/testimonials/rating-2.jpg",
                      "/testimonials/rating-3.jpg",
                    ].map((src, i) => (
                      <span
                        key={src}
                        style={{
                          position: "relative",
                          display: "inline-block",
                          flexShrink: 0,
                          width: "40px",
                          height: "40px",
                          borderRadius: "9999px",
                          border: "2px solid #0a0510",
                          overflow: "hidden",
                          marginLeft: i === 0 ? 0 : "-12px",
                          boxSizing: "border-box",
                        }}
                      >
                        <Image
                          src={src}
                          alt=""
                          aria-hidden="true"
                          fill
                          sizes="40px"
                          style={{ objectFit: "cover" }}
                        />
                      </span>
                    ))}
                  </div>
                  <span style={{ fontSize: "16px", color: "#fff", fontWeight: 400 }}>
                    4.9/5 Rating
                  </span>
                </div>

                <PricingTestimonialsCarousel />
              </div>

              {/* ── Why unlock section (2×2 grid) ────────────────────── */}
              <div
                style={{
                  position: "relative",
                  isolation: "isolate",
                  marginBottom: "56px",
                }}
              >
                <span aria-hidden="true" className="rpm-orb rpm-orb--why-tl" />
                <span aria-hidden="true" className="rpm-orb rpm-orb--why-mr" />
                <h3
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "var(--rpm-section-h)",
                    fontWeight: 700,
                    color: "#fff",
                    textAlign: "center",
                    lineHeight: "normal",
                    marginBottom: "40px",
                  }}
                >
                  Why unlock the <span className="rpm-why-mobile-br" aria-hidden="true" />
                  <em style={{ color: "#a78bfa", fontStyle: "italic", fontWeight: 700 }}>
                    Full Report
                  </em>
                  <span className="rpm-why-desktop-space"> </span>?
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
                  {WHY_CARDS.map(
                    ({ badge: cardBadge, icon, title, subtitle, body, accentRgb, showPrice }) => (
                      <div
                        key={title}
                        style={{
                          position: "relative",
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "var(--rpm-why-card-radius)",
                          padding: "var(--rpm-why-card-pad)",
                          backdropFilter: "blur(6px)",
                          WebkitBackdropFilter: "blur(6px)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          isolation: "isolate",
                        }}
                      >
                        {/* Inner clip — keeps the accent glow bounded by the card */}
                        <div
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "var(--rpm-why-card-radius)",
                            overflow: "hidden",
                            pointerEvents: "none",
                            zIndex: -1,
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              right: "-96px",
                              top: "-96px",
                              width: "200px",
                              height: "200px",
                              borderRadius: "50%",
                              background: `rgba(${accentRgb},0.18)`,
                              filter: "blur(36px)",
                            }}
                          />
                        </div>

                        {/* Icon + badge row */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "48px",
                              height: "48px",
                              borderRadius: "14px",
                              background: `linear-gradient(135deg, rgba(${accentRgb},0.2) 0%, rgba(${accentRgb},0.05) 100%)`,
                              border: `1px solid rgba(${accentRgb},0.3)`,
                              boxShadow: `0px 0px 24px -5px rgba(${accentRgb},0.3)`,
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
                              fontSize: "var(--rpm-why-card-badge)",
                              fontWeight: 700,
                              letterSpacing: "1.2px",
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                              lineHeight: 1,
                            }}
                          >
                            {cardBadge}
                          </div>
                        </div>

                        <div
                          style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "var(--rpm-why-card-title)",
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.95)",
                            lineHeight: 1.15,
                            letterSpacing: "-0.8px",
                            margin: "0 0 8px",
                            display: "flex",
                            alignItems: "flex-end",
                            minHeight: "calc(2.3 * var(--rpm-why-card-title))",
                          }}
                        >
                          {title}
                        </div>
                        <div
                          style={{
                            alignSelf: "stretch",
                            fontFamily: "var(--font-serif)",
                            fontSize: "20px",
                            fontWeight: 400,
                            fontStyle: "normal",
                            color: `rgb(${accentRgb})`,
                            marginBottom: "8px",
                            lineHeight: "24px",
                            letterSpacing: "-0.45px",
                          }}
                        >
                          {subtitle}
                        </div>
                        {showPrice && quote && (
                          <p style={{ margin: "auto 0 0", lineHeight: 1.4 }}>
                            <span
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "20px",
                                fontWeight: 600,
                                color: `rgb(${accentRgb})`,
                              }}
                            >
                              {formatReportPurchasePrice(quote.currentPriceCents)}
                            </span>
                            <span
                              style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "13px",
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
                              fontSize: "13px",
                              color: "#fff",
                              lineHeight: 1.4,
                              margin: "auto 0 0",
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

                {/* Mobile-only nav for the why-unlock carousel */}
                <div
                  className="rpm-why-nav"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    marginTop: "20px",
                  }}
                >
                  <button
                    type="button"
                    aria-label="Previous"
                    onClick={() => scrollWhyToPage(Math.max(0, whyPage - 1))}
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
                      cursor: whyPage === 0 ? "default" : "pointer",
                      opacity: whyPage === 0 ? 0.35 : 1,
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
                    {Array.from({ length: WHY_PAGES }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Go to card ${i + 1}`}
                        onClick={() => scrollWhyToPage(i)}
                        style={{
                          width: whyPage === i ? "20px" : "8px",
                          height: "8px",
                          borderRadius: "9999px",
                          background: whyPage === i ? "#a78bfa" : "rgba(255,255,255,0.25)",
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
                    onClick={() => scrollWhyToPage(Math.min(WHY_PAGES - 1, whyPage + 1))}
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
                      cursor: whyPage === WHY_PAGES - 1 ? "default" : "pointer",
                      opacity: whyPage === WHY_PAGES - 1 ? 0.35 : 1,
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

              {/* ── Preview of what's inside (carousel) ──────────────── */}
              <div style={{ marginBottom: "40px" }}>
                <div style={{ textAlign: "center", marginBottom: "32px" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      padding: "var(--rpm-pill-pad)",
                      borderRadius: "9999px",
                      border: "1px solid rgba(58,37,89,0.6)",
                      background: "rgba(21,10,34,0.6)",
                      boxShadow: "0 0 20px 0 rgba(167,139,250,0.1)",
                      marginBottom: "16px",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="rpm-preview-dot"
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#fe6839",
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "var(--rpm-pill-text)",
                        fontWeight: 500,
                        color: "#a78bfa",
                        letterSpacing: "1.2px",
                        textTransform: "uppercase",
                        lineHeight: 1,
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
                        minHeight: "386px",
                        position: "relative",
                        background: "rgba(10,5,16,0.8)",
                        backdropFilter: "blur(6px)",
                        WebkitBackdropFilter: "blur(6px)",
                        border: "1px solid rgba(167,139,250,0.3)",
                        borderRadius: "24px",
                        boxShadow: "0px 0px 15px 0px rgba(192,132,252,0.15)",
                        padding: "25px",
                        scrollSnapAlign: "start",
                        display: "flex",
                        flexDirection: "column",
                        isolation: "isolate",
                        clipPath: "inset(0 round 24px)",
                        WebkitClipPath: "inset(0 round 24px)",
                      }}
                    >
                      {/* Inner clip — keeps the purple decorative orbs bounded
                          by the card's rounded shape (backdrop-filter on parent
                          breaks overflow:hidden masking in some browsers). */}
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: "24px",
                          overflow: "hidden",
                          pointerEvents: "none",
                          zIndex: -1,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            right: "-77px",
                            top: "-79px",
                            width: "192px",
                            height: "192px",
                            borderRadius: "50%",
                            background: "rgba(167,139,250,0.36)",
                            filter: "blur(50px)",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            right: "-100px",
                            bottom: "-80px",
                            width: "192px",
                            height: "192px",
                            borderRadius: "50%",
                            background: "rgba(167,139,250,0.36)",
                            filter: "blur(50px)",
                          }}
                        />
                      </div>

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
                      minHeight: "386px",
                      position: "relative",
                      background: "rgba(10,5,16,0.8)",
                      backdropFilter: "blur(6px)",
                      WebkitBackdropFilter: "blur(6px)",
                      border: "1px solid rgba(167,139,250,0.5)",
                      borderRadius: "24px",
                      boxShadow: "0px 0px 20px 0px rgba(192,132,252,0.2)",
                      padding: "25px",
                      scrollSnapAlign: "start",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      isolation: "isolate",
                      clipPath: "inset(0 round 24px)",
                      WebkitClipPath: "inset(0 round 24px)",
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
                      className="rpm-cta"
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
                      <span className="rpm-cta__wash" aria-hidden="true" />
                      <span className="rpm-cta__reveal" aria-hidden="true" />
                      <span className="rpm-cta__label">Unlock full report</span>
                      <svg
                        className="rpm-cta__arrow"
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

              {/* ── Desktop-only final CTA card (Figma 7128:19040) ─────── */}
              <section className="rpm-end-cta" aria-labelledby="rpm-end-cta-heading">
                <div className="rpm-end-cta__inner">
                  <h3 id="rpm-end-cta-heading" className="rpm-end-cta__heading">
                    Ready to dive deep?
                  </h3>
                  <div className="rpm-end-cta__stats">
                    <p className="rpm-end-cta__stats-line">
                      <span className="rpm-end-cta__stats-num">32</span>
                      <span className="rpm-end-cta__stats-text"> chapters. </span>
                      <span className="rpm-end-cta__stats-num">~50</span>
                      <span className="rpm-end-cta__stats-text"> pages. </span>
                      <span className="rpm-end-cta__stats-num">
                        {quote ? formatReportPurchasePrice(quote.currentPriceCents) : "€9.99"}
                      </span>
                      <span className="rpm-end-cta__stats-text"> once, yours forever.</span>
                    </p>
                    <p className="rpm-end-cta__stats-line">
                      <span className="rpm-end-cta__stats-num">14-day money-back</span>
                      <span className="rpm-end-cta__stats-text"> if it&rsquo;s not for you.</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rpm-end-cta__button rpm-cta"
                    onClick={handleCtaClick}
                    aria-label="Unlock full report"
                  >
                    <span className="rpm-cta__wash" aria-hidden="true" />
                    <span className="rpm-cta__reveal" aria-hidden="true" />
                    <span className="rpm-end-cta__button-label rpm-cta__label">
                      Unlock full report
                    </span>
                    <svg
                      className="rpm-cta__arrow"
                      width="24"
                      height="24"
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
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ScrollPricingModal;
