"use client";

import { useState, useEffect, useRef } from "react";
import type { FC } from "react";
import Image from "next/image";
import Link from "next/link";
import { trackStartSurvey } from "@/lib/analytics";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "Glossary", href: "/glossary" },
  { label: "Trust Zone", href: "/trust-zone" },
];

const SCROLL_THRESHOLD = 15;
const MOBILE_BREAKPOINT = 640;

function useScrollDirection() {
  const [isHidden, setIsHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const lastScrollY = useRef(0);
  const lastDirection = useRef<"up" | "down" | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) {
        setIsHidden(false);
      }
    };

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

      if (scrollY <= 0) {
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

const GlossaryNavSection: FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isHidden, isMobile } = useScrollDirection();
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu when navbar hides on scroll or viewport resizes to desktop.
  // Only depends on isHidden/isMobile — NOT menuOpen — so clicks cannot race this effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync menu state with scroll/resize
    if (isHidden || !isMobile) setMenuOpen(false);
  }, [isHidden, isMobile]);

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
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
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

  const shouldHide = isHidden && isMobile;

  return (
    <header
      className={`pointer-events-none fixed inset-x-0 top-0 z-[120] px-2 sm:px-4 sm:top-3 sm:z-40 nav-header ${shouldHide ? "nav-hidden" : ""}`}
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
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/favicon.svg"
                  alt=""
                  width={28}
                  height={28}
                  unoptimized
                  className="h-7 w-7 rounded-full shadow-[0_8px_18px_rgba(0,0,0,0.28)]"
                />
                <span className="font-serif text-xl font-semibold text-white">LoveIQ</span>
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
                href="/waitlist"
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
                  Start survey now
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
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80 shadow-[0_10px_20px_rgba(0,0,0,0.25)] transition hover:border-white/20 hover:text-white focus-visible-ring sm:hidden ${menuOpen ? "hamburger-open" : ""}`}
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
                  href="/waitlist"
                  role="menuitem"
                  tabIndex={menuOpen ? 0 : -1}
                  aria-label="Start survey now"
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
                    Start survey now
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

export default GlossaryNavSection;
