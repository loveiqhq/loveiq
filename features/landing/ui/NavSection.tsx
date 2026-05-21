"use client";

import { useState, useEffect, useRef } from "react";
import type { FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";
import { LoveIQMark, LoveIQWordmark } from "@shared/ui/branding/LoveIQBrand";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "Glossary", href: "/glossary" },
  { label: "Trust Zone", href: "/trust-zone" },
];

// Scroll threshold in pixels to prevent flickering on small scroll movements
const SCROLL_THRESHOLD = 15;
// Mobile breakpoint matching Tailwind's sm: (640px)
const MOBILE_BREAKPOINT = 640;

function useScrollDirection() {
  const [isHidden, setIsHidden] = useState(false);
  // Start as true — safe default before checkMobile() runs.
  // !true = false, so the close-menu effect never misfires on initial hydration.
  // checkMobile() corrects it to false on desktop after mount.
  const [isMobile, setIsMobile] = useState(true);
  const lastScrollY = useRef(0);
  const lastDirection = useRef<"up" | "down" | null>(null);

  useEffect(() => {
    // Check if mobile on mount and resize
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) {
        setIsHidden(false);
      }
    };

    // Get scroll position - Lenis uses documentElement as scroll container
    const getScrollY = () => {
      return window.scrollY || document.documentElement.scrollTop;
    };

    checkMobile();
    lastScrollY.current = getScrollY();

    let ticking = false;

    const updateScrollDirection = () => {
      const scrollY = getScrollY();
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;

      if (!mobile) {
        setIsHidden(false);
        lastScrollY.current = scrollY;
        ticking = false;
        return;
      }

      // Always show at top
      if (scrollY <= 0) {
        setIsHidden(false);
        lastScrollY.current = scrollY;
        ticking = false;
        return;
      }

      const diff = scrollY - lastScrollY.current;

      // Only update if we've scrolled past threshold
      if (Math.abs(diff) >= SCROLL_THRESHOLD) {
        const direction = diff > 0 ? "down" : "up";

        // Only update state if direction actually changed
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

    // Listen on window for scroll events (Lenis uses documentElement)
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", checkMobile, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  return { isHidden, isMobile };
}

const NavSection: FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isHidden, isMobile } = useScrollDirection();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: hydration gate for Playwright
    setMounted(true);
  }, []);

  // Close menu when resizing to desktop.
  // Only depends on isMobile — NOT menuOpen — so clicking the hamburger never
  // triggers this effect and cannot race against setMenuOpen(true).
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

  // Focus trap for mobile menu
  useEffect(() => {
    if (!menuOpen || !menuRef.current) return;
    const menu = menuRef.current;
    const focusable = menu.querySelectorAll<HTMLElement>(
      "a, button, [tabindex]:not([tabindex='-1'])"
    );
    if (focusable.length === 0) return;
    // focusable.length checked > 0 above; first/last are defined.
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
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    menu.addEventListener("keydown", trapFocus);
    return () => menu.removeEventListener("keydown", trapFocus);
  }, [menuOpen]);

  // Body scroll lock (iOS Safari compatible)
  useEffect(() => {
    if (menuOpen) {
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
        window.scrollTo(0, scrollY);
      };
    }
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  // Only apply hide transform on mobile
  const shouldHide = isHidden && isMobile;

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-40 px-2 sm:px-4 sm:top-3 nav-header ${shouldHide ? "nav-hidden" : ""}`}
    >
      {/* Mobile backdrop overlay */}
      <div
        className={`mobile-menu-backdrop sm:hidden ${menuOpen ? "is-open" : ""}`}
        aria-hidden="true"
        onClick={closeMenu}
      />
      <div className="content-shell">
        <div className="relative z-10 pointer-events-auto">
          <div className="pointer-events-none absolute inset-[-10px] rounded-[999px] bg-[radial-gradient(80%_120%_at_50%_50%,rgba(0,0,0,0.55),transparent_65%)] blur-3xl" />
          <nav className="relative mx-auto flex w-full items-center justify-between gap-2 rounded-[999px] bg-gradient-to-r from-[#1b0f2a] via-[#120a20] to-[#1b0f2a] px-3 py-2 shadow-[0_25px_80px_rgba(0,0,0,0.55)] backdrop-blur sm:gap-5 sm:pl-6 sm:pr-2 sm:py-[6px] sm:max-w-[1200px]">
            <div className="flex flex-1 items-center gap-2">
              <Link
                href="/"
                className="flex items-center gap-2 focus-visible-ring"
                onClick={(e) => {
                  if (window.location.pathname === "/") {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              >
                <LoveIQMark className="h-7 w-8 shrink-0" width={32} height={28} priority />
                <LoveIQWordmark className="text-xl" />
              </Link>
            </div>

            <div className="hidden flex-1 items-center justify-center gap-3 lg:flex">
              {navLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white focus-visible-ring"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="flex flex-1 items-center justify-end gap-2 sm:gap-2">
              {navLinks.slice(0, 3).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hidden shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/85 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition hover:-translate-y-[2px] hover:border-white/25 hover:text-white focus-visible-ring sm:inline-flex lg:hidden"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/survey"
                aria-label="Start test now - navigation"
                className="group relative inline-flex shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full bg-gradient-brand px-3.5 py-2 text-[12px] font-semibold text-white shadow-pill transition hover:translate-y-[-2px] focus-visible-ring sm:gap-2 sm:px-6 sm:py-3 sm:text-sm"
                onClick={() => trackStartSurvey("nav")}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 translate-y-full bg-white/20 transition-transform duration-300 group-hover:translate-y-0"
                />
                <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition duration-300 group-hover:opacity-100" />
                <span className="pointer-events-none absolute inset-[-12%] rounded-full border border-white/15 mix-blend-screen opacity-70" />
                <span className="relative z-10 transition-colors duration-500 group-hover:text-black">
                  Start test now
                </span>
                <svg
                  aria-hidden
                  className="relative z-10 h-4 w-4 sm:h-5 sm:w-5 transition-colors duration-500 group-hover:text-black"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
              <button
                type="button"
                className={`hidden max-sm:flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80 shadow-[0_10px_20px_rgba(0,0,0,0.25)] transition-colors hover:border-white/20 hover:text-white focus-visible-ring disabled:opacity-100 disabled:cursor-pointer ${menuOpen ? "hamburger-open" : ""}`}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                <div className="flex h-4 w-[18px] flex-col gap-[5px]">
                  <span className="hamburger-line" />
                  <span className="hamburger-line" />
                  <span className="hamburger-line" />
                </div>
              </button>
            </div>
          </nav>
          {/* Mobile menu panel — always in DOM for exit animation */}
          <div
            ref={menuRef}
            role="menu"
            className={`mobile-menu-panel sm:hidden ${menuOpen ? "is-open" : ""}`}
          >
            {/* Glow effect */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-10 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#fe6839]/20 to-[#9c7dff]/20 blur-2xl"
            />
            {/* Gradient accent line */}
            <div aria-hidden="true" className="mobile-menu-gradient-accent" />
            {/* Nav links + CTA */}
            <div className="flex flex-col px-2 pt-4 pb-3">
              {navLinks.map((item, i) => (
                <div
                  key={item.href}
                  className="mobile-menu-link"
                  style={{ transitionDelay: menuOpen ? `${80 + i * 60}ms` : "0ms" }}
                >
                  <Link
                    href={item.href}
                    role="menuitem"
                    tabIndex={menuOpen ? 0 : -1}
                    className="flex w-full items-center px-4 py-3 rounded-[14px] text-[15px] font-semibold text-white/90 transition-all duration-200 hover:bg-white/[0.06] hover:translate-x-1 hover:text-white active:scale-[0.98] focus-visible-ring"
                    onClick={closeMenu}
                  >
                    {item.label}
                  </Link>
                </div>
              ))}
              {/* Divider */}
              <div className="mx-4 my-2 h-px bg-white/[0.08]" />
              {/* CTA */}
              <div
                className="mobile-menu-link"
                style={{ transitionDelay: menuOpen ? "320ms" : "0ms" }}
              >
                <Link
                  href="/survey"
                  role="menuitem"
                  tabIndex={menuOpen ? 0 : -1}
                  aria-label="Start test now"
                  className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-brand mx-2 mt-1 px-6 py-3 text-sm font-semibold text-white shadow-pill transition hover:translate-y-[-2px] focus-visible-ring"
                  onClick={() => {
                    trackStartSurvey("nav");
                    closeMenu();
                  }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 translate-y-full bg-white/20 transition-transform duration-300 group-hover:translate-y-0"
                  />
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition duration-300 group-hover:opacity-100" />
                  <span className="relative z-10 transition-colors duration-500 group-hover:text-black">
                    Start test now
                  </span>
                  <svg
                    aria-hidden
                    className="relative z-10 h-4 w-4 transition-colors duration-500 group-hover:text-black"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default NavSection;
