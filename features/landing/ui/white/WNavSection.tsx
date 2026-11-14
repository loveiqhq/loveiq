"use client";

import { useState, useEffect, useRef } from "react";
import type { FC, MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";
import { LoveIQMark, LoveIQWordmark } from "@shared/ui/branding/LoveIQBrand";
import { restoreScroll } from "@shared/ui/restore-scroll";

/** What was pressed in the nav, for a page that counts where its visitors go. */
export type WNavItem = "logo" | "home" | "about" | "glossary" | "trust_center" | "cta";

/**
 * The "Start test now" button. On the site it starts the free survey; a page that sells
 * before the survey (pay to start) points it at its own price with an in-page `#…` link.
 */
export interface WNavCta {
  href: string;
  /** Runs on a press, before the browser follows `href`. */
  onPress?: () => void;
}

/**
 * The bar's dress. `default` is every page's; `painpoint` is the new landing page's
 * (round 4's `pain_point`, Claude Design board Hero 3): the links sit between the logo and
 * the button instead of centred on the page, the button is a white pill with a gradient
 * edge, and the menu button is a bare three-line icon. Behaviour is the same.
 */
export type WNavAppearance = "default" | "painpoint";

interface WNavSectionProps {
  /** Defaults to the free survey, counted as the landing's `cta_click` from "nav". */
  cta?: WNavCta;
  onNavigate?: (item: WNavItem, place: "bar" | "menu") => void;
  /** The bar's inner width: the landing's `content-shell` unless the page has its own grid. */
  shellClassName?: string;
  appearance?: WNavAppearance;
}

const SURVEY_CTA: WNavCta = { href: "/survey", onPress: () => trackStartSurvey("nav") };

// White-landing nav. Links point to the existing (dark) sub-pages — only the
// landing page has a white variant. Labels follow the Figma design
// ("About us", "Trust Center").
const navLinks: { label: string; href: string; item: WNavItem }[] = [
  { label: "Home", href: "/", item: "home" },
  { label: "About us", href: "/about", item: "about" },
  { label: "Glossary", href: "/glossary", item: "glossary" },
  { label: "Trust Center", href: "/trust-zone", item: "trust_center" },
];

const isInPageHref = (href: string) => href.startsWith("#");

/**
 * The button's link. An in-page `#…` one is a plain anchor, which the browser (or Lenis,
 * whose `anchors` option reads the target's scroll-margin) scrolls to, as the report's
 * chapter links do; any other is a client-side Link.
 */
const CtaLink: FC<{
  href: string;
  className: string;
  ariaLabel: string;
  tabIndex?: number;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
}> = ({ href, ariaLabel, ...rest }) =>
  isInPageHref(href) ? (
    <a href={href} aria-label={ariaLabel} {...rest} />
  ) : (
    <Link href={href} aria-label={ariaLabel} {...rest} />
  );

const SCROLL_THRESHOLD = 15;
const MOBILE_BREAKPOINT = 640;

// Hide-on-scroll (mobile only). Ported verbatim from the dark NavSection so the
// documented Safari/iOS race-condition fixes carry over: `isMobile` starts true
// and the close-menu effect depends ONLY on isMobile (never menuOpen).
function useScrollDirection() {
  const [isHidden, setIsHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const lastScrollY = useRef(0);
  const lastDirection = useRef<"up" | "down" | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setIsHidden(false);
    };
    const getScrollY = () => window.scrollY || document.documentElement.scrollTop;

    checkMobile();
    lastScrollY.current = getScrollY();

    let ticking = false;
    const updateScrollDirection = () => {
      const scrollY = getScrollY();
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      if (!mobile || scrollY <= 0) {
        setIsHidden(false);
        lastScrollY.current = scrollY;
        ticking = false;
        return;
      }
      const diff = scrollY - lastScrollY.current;
      if (Math.abs(diff) >= SCROLL_THRESHOLD) {
        const direction = diff > 0 ? "down" : "up";
        if (direction !== lastDirection.current) {
          lastDirection.current = direction;
          setIsHidden(direction === "down");
        }
        lastScrollY.current = scrollY;
      }
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateScrollDirection);
        ticking = true;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", checkMobile, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  return { isHidden, isMobile };
}

const arrowPath = (
  <>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </>
);

const WNavSection: FC<WNavSectionProps> = ({
  cta = SURVEY_CTA,
  onNavigate,
  shellClassName = "content-shell",
  appearance = "default",
}) => {
  const painpoint = appearance === "painpoint";
  const [menuOpen, setMenuOpen] = useState(false);
  const { isHidden, isMobile } = useScrollDirection();
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on resize to desktop. Depends ONLY on isMobile — never menuOpen — so
  // tapping the hamburger can't race against setMenuOpen(true) (Safari fix).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync menu state with resize
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Focus trap for the open mobile menu.
  useEffect(() => {
    if (!menuOpen || !menuRef.current) return;
    const menu = menuRef.current;
    const focusable = menu.querySelectorAll<HTMLElement>(
      "a, button, [tabindex]:not([tabindex='-1'])"
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    first.focus();
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    menu.addEventListener("keydown", trapFocus);
    return () => menu.removeEventListener("keydown", trapFocus);
  }, [menuOpen]);

  // Body scroll lock (iOS Safari compatible).
  useEffect(() => {
    if (!menuOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      restoreScroll(scrollY);
    };
  }, [menuOpen]);

  // An in-page button pressed in the menu jumps once the menu has let go of the page:
  // closing it puts the page back where it was (restoreScroll above, whose cleanup React
  // runs before this), which would undo a jump made during the tap. As the report's
  // chapter drawer does (ReportMobileNav's pendingJumpRef).
  const pendingJumpRef = useRef<string | null>(null);
  useEffect(() => {
    if (menuOpen || !pendingJumpRef.current) return;
    const id = pendingJumpRef.current;
    pendingJumpRef.current = null;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const shouldHide = isHidden && isMobile;

  const pressCta = (place: "bar" | "menu", event: MouseEvent<HTMLAnchorElement>) => {
    cta.onPress?.();
    onNavigate?.("cta", place);
    if (place === "bar") return;
    if (isInPageHref(cta.href)) {
      event.preventDefault();
      pendingJumpRef.current = cta.href.slice(1);
    }
    closeMenu();
  };

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-40 nav-header ${shouldHide ? "nav-hidden" : ""}`}
    >
      <div
        className={`w-menu-backdrop sm:hidden ${menuOpen ? "is-open" : ""}`}
        aria-hidden="true"
        onClick={closeMenu}
      />
      <div className="pointer-events-auto border-b border-black/[0.08] bg-white/90 backdrop-blur">
        <div className={shellClassName}>
          <nav className="relative flex h-[64px] items-center justify-between gap-3">
            {/* Logo */}
            <Link
              href="/"
              className="focus-visible-ring flex items-center gap-2"
              onClick={(e) => {
                onNavigate?.("logo", "bar");
                if (window.location.pathname === "/") {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
            >
              <LoveIQMark className="h-7 w-8 shrink-0" width={32} height={28} priority />
              <LoveIQWordmark
                className="text-xl"
                loveClassName={painpoint ? "text-[#161021]" : "text-gray-900"}
              />
            </Link>

            {/* Center links (desktop) */}
            <div
              className={
                painpoint
                  ? "hidden items-center gap-9 lg:flex"
                  : "absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 lg:flex"
              }
            >
              {navLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="focus-visible-ring rounded text-sm font-bold text-[#3f3a4d] transition hover:text-black"
                  onClick={() => onNavigate?.(item.item, "bar")}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Right: CTA + hamburger */}
            <div className="flex items-center gap-2">
              <CtaLink
                href={cta.href}
                ariaLabel="Start test now - navigation"
                className={
                  painpoint
                    ? "focus-visible-ring group box-border inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-solid border-transparent px-3 py-2 text-[13px] font-bold leading-5 text-[#3a2a55] transition-[background,box-shadow] duration-[250ms] [background:linear-gradient(#ffffff,#ffffff)_padding-box,linear-gradient(135deg,#fe6839_0%,#bf66d9_43%,#958ef6_100%)_border-box] hover:shadow-[0_8px_20px_-12px_rgba(191,102,217,0.7)] hover:[background:linear-gradient(#f8f0fc,#f8f0fc)_padding-box,linear-gradient(135deg,#fe6839_0%,#bf66d9_43%,#958ef6_100%)_border-box] lg:gap-2 lg:px-[18px] lg:text-[14px]"
                    : "focus-visible-ring group inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
                }
                onClick={(event) => pressCta("bar", event)}
              >
                <span>Start test now</span>
                <svg
                  aria-hidden
                  className={painpoint ? "block h-3.5 w-3.5 lg:h-4 lg:w-4" : "h-4 w-4"}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {arrowPath}
                </svg>
              </CtaLink>
              <button
                type="button"
                className={
                  painpoint
                    ? "focus-visible-ring flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 sm:hidden"
                    : `focus-visible-ring flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-black/[0.03] text-gray-700 transition-colors hover:border-black/20 hover:text-black sm:hidden ${menuOpen ? "hamburger-open" : ""}`
                }
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                {painpoint ? (
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#161021"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="h-[22px] w-[22px]"
                  >
                    <path d={menuOpen ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} />
                  </svg>
                ) : (
                  <div className="flex h-4 w-[18px] flex-col gap-[5px]">
                    <span className="hamburger-line" />
                    <span className="hamburger-line" />
                    <span className="hamburger-line" />
                  </div>
                )}
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Mobile menu panel — always in DOM for exit animation */}
      <div ref={menuRef} className={`w-menu-panel sm:hidden ${menuOpen ? "is-open" : ""}`}>
        <div aria-hidden="true" className="mobile-menu-gradient-accent" />
        <div className="flex flex-col px-2 pt-4 pb-3">
          {navLinks.map((item, i) => (
            <div
              key={item.href}
              className="mobile-menu-link"
              style={{ transitionDelay: menuOpen ? `${80 + i * 60}ms` : "0ms" }}
            >
              <Link
                href={item.href}
                tabIndex={menuOpen ? 0 : -1}
                className="focus-visible-ring flex w-full items-center rounded-[14px] px-4 py-3 text-[15px] font-semibold text-gray-800 transition-all duration-200 hover:translate-x-1 hover:bg-black/[0.04] hover:text-black active:scale-[0.98]"
                onClick={() => {
                  onNavigate?.(item.item, "menu");
                  closeMenu();
                }}
              >
                {item.label}
              </Link>
            </div>
          ))}
          <div className="mx-4 my-2 h-px bg-black/[0.08]" />
          <div className="mobile-menu-link" style={{ transitionDelay: menuOpen ? "320ms" : "0ms" }}>
            <CtaLink
              href={cta.href}
              tabIndex={menuOpen ? 0 : -1}
              ariaLabel="Start test now"
              className="focus-visible-ring mx-2 mt-1 flex items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
              onClick={(event) => pressCta("menu", event)}
            >
              <span>Start test now</span>
              <svg
                aria-hidden
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {arrowPath}
              </svg>
            </CtaLink>
          </div>
        </div>
      </div>
    </header>
  );
};

export default WNavSection;
